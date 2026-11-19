package com.example.ui.modals

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.annotation.OptIn
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.FlashlightOff
import androidx.compose.material.icons.rounded.FlashlightOn
import androidx.compose.material.icons.rounded.ImageSearch
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.PosMath
import com.example.hardware.AndroidDeviceBridge
import com.example.model.ScannerMode
import com.example.model.ToastType
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

@OptIn(ExperimentalGetImage::class)
@Composable
fun BarcodeScannerScreen(vm: PosViewModel) {
    val state by vm.scannerState.collectAsStateWithLifecycle()
    if (!state.open) return

    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val barcodeIndex by vm.barcodeIndex.collectAsStateWithLifecycle()
    val cartTotals by vm.cartTotals.collectAsStateWithLifecycle()
    val cart by vm.cart.collectAsStateWithLifecycle()

    var hasCameraPerm by remember {
        mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED)
    }
    val camPermLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPerm = granted
    }
    LaunchedEffect(state.open) {
        if (!hasCameraPerm) camPermLauncher.launch(Manifest.permission.CAMERA)
    }

    var rapidMode by remember(state.open) { mutableStateOf(state.continuous) }
    var torchOn by remember { mutableStateOf(false) }
    var boundCamera by remember { mutableStateOf<Camera?>(null) }
    var manualCode by remember { mutableStateOf("") }
    var lastDetectedCode by remember { mutableStateOf("") }
    var lastScanMs by remember { mutableLongStateOf(0L) }
    var notFoundCode by remember { mutableStateOf<String?>(null) }

    fun handleRawBarcode(raw: String) {
        val now = System.currentTimeMillis()
        if (raw == lastDetectedCode && now - lastScanMs < 1350L) return
        lastDetectedCode = raw
        lastScanMs = now

        val payload = PosMath.extractScanPayload(raw)
        val cleanCode = payload.code.ifBlank { raw.trim() }

        when (state.mode) {
            ScannerMode.pos -> {
                val prod = PosMath.findProductByBarcodeIndexed(cleanCode, barcodeIndex)
                if (prod != null) {
                    notFoundCode = null
                    if (payload.qty != 1.0 || prod.unit != "kg") {
                        vm.addQtyToCart(prod, payload.qty)
                    } else {
                        vm.onProductClick(prod)
                    }
                    if (!rapidMode) vm.closeScanner()
                } else {
                    notFoundCode = cleanCode
                    vm.toast("Barcode $cleanCode not found", ToastType.WARNING)
                }
            }
            ScannerMode.inventory -> {
                val prod = PosMath.findProductByBarcodeIndexed(cleanCode, barcodeIndex)
                if (prod != null) {
                    vm.setInvSearch(prod.barcode.ifBlank { prod.name })
                    vm.closeScanner()
                } else {
                    vm.closeScanner()
                    vm.openProductModal(initialBarcode = cleanCode)
                }
            }
            ScannerMode.productForm -> {
                vm.openProductModal(editingId = vm.productModal.value.editingProduct?.id, initialBarcode = cleanCode)
                vm.closeScanner()
            }
        }
    }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            val decoded = AndroidDeviceBridge.decodeQrOrBarcodeFromUri(context, uri)
            if (!decoded.isNullOrBlank()) {
                handleRawBarcode(decoded)
            } else {
                vm.toast("No barcode detected in image", ToastType.WARNING)
            }
        }
    }

    BackHandler { vm.closeScanner() }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(PosColors.Slate950)
            .systemBarsPadding()
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            Row(
                modifier = Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 10.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Icon(Icons.Rounded.QrCodeScanner, contentDescription = null, tint = PosColors.Emerald500)
                    Text("Barcode & GS1 Scanner", color = Color.White, style = MaterialTheme.typography.titleMedium)
                }
                Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                    IconButton(
                        onClick = {
                            torchOn = !torchOn
                            boundCamera?.cameraControl?.enableTorch(torchOn)
                        }
                    ) {
                        Icon(
                            if (torchOn) Icons.Rounded.FlashlightOn else Icons.Rounded.FlashlightOff,
                            contentDescription = "Toggle Flashlight",
                            tint = Color.White
                        )
                    }
                    IconButton(onClick = { vm.closeScanner() }, modifier = Modifier.testTag("scanner_close_btn")) {
                        Icon(Icons.Rounded.Close, contentDescription = "Close scanner", tint = Color.White)
                    }
                }
            }

            Box(modifier = Modifier.weight(1f).fillMaxWidth()) {
                if (hasCameraPerm) {
                    val executor = remember { Executors.newSingleThreadExecutor() }
                    val scanner = remember { BarcodeScanning.getClient() }
                    DisposableEffect(Unit) {
                        onDispose {
                            executor.shutdown()
                            scanner.close()
                        }
                    }

                    AndroidView(
                        factory = { ctx ->
                            val previewView = PreviewView(ctx)
                            val providerFuture = ProcessCameraProvider.getInstance(ctx)
                            providerFuture.addListener({
                                val provider = providerFuture.get()
                                val preview = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
                                val analysis = ImageAnalysis.Builder()
                                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                    .build()
                                analysis.setAnalyzer(executor) { imageProxy ->
                                    val mediaImg = imageProxy.image
                                    if (mediaImg != null) {
                                        val input = InputImage.fromMediaImage(mediaImg, imageProxy.imageInfo.rotationDegrees)
                                        scanner.process(input)
                                            .addOnSuccessListener { list ->
                                                val rawVal = list.firstOrNull()?.rawValue
                                                if (!rawVal.isNullOrBlank()) {
                                                    previewView.post { handleRawBarcode(rawVal) }
                                                }
                                            }
                                            .addOnCompleteListener { imageProxy.close() }
                                    } else {
                                        imageProxy.close()
                                    }
                                }
                                runCatching {
                                    provider.unbindAll()
                                    boundCamera = provider.bindToLifecycle(
                                        lifecycleOwner,
                                        CameraSelector.DEFAULT_BACK_CAMERA,
                                        preview,
                                        analysis
                                    )
                                }
                            }, ContextCompat.getMainExecutor(ctx))
                            previewView
                        },
                        modifier = Modifier.fillMaxSize()
                    )
                } else {
                    Column(
                        modifier = Modifier.fillMaxSize().padding(24.dp),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.Center
                    ) {
                        Text("Camera permission is required for live barcode scanning.", color = Color.White, style = MaterialTheme.typography.titleSmall)
                        Spacer(Modifier.height(10.dp))
                        Button(onClick = { camPermLauncher.launch(Manifest.permission.CAMERA) }) {
                            Text("Grant Camera Access")
                        }
                    }
                }

                // Reticle Box
                Surface(
                    shape = RoundedCornerShape(16.dp),
                    color = Color.Transparent,
                    border = BorderStroke(2.dp, PosColors.Emerald500),
                    modifier = Modifier.align(Alignment.Center).size(width = 260.dp, height = 140.dp)
                ) {}
            }

            Surface(color = PosColors.Slate900) {
                Column(modifier = Modifier.fillMaxWidth().padding(12.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (notFoundCode != null && state.mode == ScannerMode.pos) {
                        Surface(shape = RoundedCornerShape(10.dp), color = PosColors.Amber700.copy(alpha = 0.25f)) {
                            Row(
                                modifier = Modifier.fillMaxWidth().padding(10.dp),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("Unknown barcode: $notFoundCode", color = Color.White, fontSize = 12.sp)
                                Button(
                                    onClick = {
                                        val code = notFoundCode!!
                                        vm.closeScanner()
                                        vm.openProductModal(initialBarcode = code)
                                    },
                                    colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600)
                                ) { Text("Add SKU", fontSize = 11.sp) }
                            }
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                        OutlinedTextField(
                            value = manualCode,
                            onValueChange = { manualCode = it },
                            placeholder = { Text("Enter barcode manually", color = PosColors.Slate400, fontSize = 12.sp) },
                            singleLine = true,
                            colors = OutlinedTextFieldDefaults.colors(
                                focusedTextColor = Color.White,
                                unfocusedTextColor = Color.White,
                                focusedBorderColor = PosColors.Emerald500,
                                unfocusedBorderColor = PosColors.Slate600
                            ),
                            modifier = Modifier.weight(1f)
                        )
                        Button(
                            onClick = {
                                if (manualCode.isNotBlank()) {
                                    handleRawBarcode(manualCode)
                                    manualCode = ""
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald600)
                        ) { Text("Submit") }
                    }

                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            if (state.mode == ScannerMode.pos) {
                                FilterChip(
                                    selected = rapidMode,
                                    onClick = { rapidMode = !rapidMode },
                                    label = { Text(if (rapidMode) "Rapid Scan: ON" else "Single Scan", fontSize = 11.sp) }
                                )
                            }
                            OutlinedButton(onClick = { photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }) {
                                Icon(Icons.Rounded.ImageSearch, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
                                Spacer(Modifier.width(4.dp))
                                Text("Scan Photo", color = Color.White, fontSize = 11.sp)
                            }
                        }
                        if (state.mode == ScannerMode.pos && cart.isNotEmpty()) {
                            Button(
                                onClick = { vm.closeScanner(); vm.openCheckout() },
                                colors = ButtonDefaults.buttonColors(containerColor = PosColors.Emerald500, contentColor = PosColors.Slate950)
                            ) {
                                Text("Pay ${PosMath.formatPeso(cartTotals.grandTotal)}", fontWeight = FontWeight.ExtraBold, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}
