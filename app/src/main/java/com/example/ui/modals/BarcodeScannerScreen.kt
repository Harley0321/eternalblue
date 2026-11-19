package com.example.ui.modals

import android.Manifest
import android.content.pm.PackageManager
import android.util.Size
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.mlkit.vision.MlKitAnalyzer
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.PosMath
import com.example.hardware.AndroidDeviceBridge
import com.example.hardware.BarcodeScannerEngine
import com.example.hardware.BarcodeSymbology
import com.example.hardware.DetectedOverlayBarcode
import com.example.hardware.ScanFeedEntry
import com.example.model.ScannerMode
import com.example.model.ToastType
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel
import kotlinx.coroutines.launch
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

@Composable
fun BarcodeScannerScreen(vm: PosViewModel) {
    val state by vm.scannerState.collectAsStateWithLifecycle()
    if (!state.open) return

    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val scope = rememberCoroutineScope()
    val barcodeIndex by vm.barcodeIndex.collectAsStateWithLifecycle()
    val cartTotals by vm.cartTotals.collectAsStateWithLifecycle()
    val cart by vm.cart.collectAsStateWithLifecycle()

    var hasCameraPerm by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        )
    }
    val camPermLauncher = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        hasCameraPerm = granted
    }
    LaunchedEffect(state.open) {
        if (!hasCameraPerm) camPermLauncher.launch(Manifest.permission.CAMERA)
    }

    var rapidMode by remember(state.open) { mutableStateOf(state.continuous) }
    var selectedSymbologies by remember { mutableStateOf(BarcodeSymbology.ALL_10) }
    var formatsExpanded by remember { mutableStateOf(false) }
    var useFrontCamera by remember { mutableStateOf(false) }
    var torchOn by remember { mutableStateOf(false) }
    var hasFlash by remember { mutableStateOf(true) }
    var autoZoomEnabled by remember { mutableStateOf(true) }
    var currentZoom by remember { mutableFloatStateOf(1.0f) }
    var maxZoom by remember { mutableFloatStateOf(4.0f) }

    var manualCode by remember { mutableStateOf("") }
    var notFoundCode by remember { mutableStateOf<String?>(null) }
    var overlayBarcodes by remember { mutableStateOf<List<DetectedOverlayBarcode>>(emptyList()) }
    var recentFeed by remember(state.open) { mutableStateOf<List<ScanFeedEntry>>(emptyList()) }
    var lastOverlayClearCheckMs by remember { mutableLongStateOf(0L) }

    // Per-barcode timestamp cooldown map so 1..10 DIFFERENT barcodes scan simultaneously in 1 frame
    val recentBarcodeMap = remember(state.open) { ConcurrentHashMap<String, Long>() }
    var feedSeq by remember(state.open) { mutableLongStateOf(1L) }

    fun processBatchBarcodes(rawDetections: List<Pair<String, String>>) {
        if (rawDetections.isEmpty()) return
        val now = System.currentTimeMillis()

        // Evict stale cooldown entries occasionally
        if (recentBarcodeMap.size > 64) {
            recentBarcodeMap.entries.removeIf { now - it.value > 5000L }
        }

        // Only process items not inside their individual anti-bounce cooldown window
        val freshItems = mutableListOf<Pair<String, String>>()
        for ((raw, fmt) in rawDetections) {
            val payload = PosMath.extractScanPayload(raw)
            val key = payload.code.ifBlank { raw.trim() }
            if (key.isEmpty()) continue
            val lastSeen = recentBarcodeMap[key] ?: 0L
            if (now - lastSeen >= 1350L) {
                recentBarcodeMap[key] = now
                freshItems.add(raw to fmt)
            }
        }
        if (freshItems.isEmpty()) return

        when (state.mode) {
            ScannerMode.pos -> {
                var addedCount = 0
                val newFeedItems = mutableListOf<ScanFeedEntry>()
                for ((raw, fmt) in freshItems) {
                    val payload = PosMath.extractScanPayload(raw)
                    val cleanCode = payload.code.ifBlank { raw.trim() }
                    val prod = PosMath.findProductByBarcodeIndexed(cleanCode, barcodeIndex)
                    if (prod != null) {
                        notFoundCode = null
                        if (payload.qty != 1.0 || prod.unit != "kg") {
                            vm.addQtyToCart(prod, payload.qty)
                        } else {
                            vm.onProductClick(prod)
                        }
                        addedCount++
                        newFeedItems.add(
                            ScanFeedEntry(
                                id = feedSeq++,
                                code = cleanCode,
                                formatLabel = fmt,
                                productId = prod.id,
                                productName = prod.name,
                                qtyAdded = payload.qty,
                                unit = prod.unit,
                                unitPrice = prod.retailPrice,
                                isUnknown = false,
                                timestampMs = now
                            )
                        )
                    } else {
                        notFoundCode = cleanCode
                        newFeedItems.add(
                            ScanFeedEntry(
                                id = feedSeq++,
                                code = cleanCode,
                                formatLabel = fmt,
                                isUnknown = true,
                                timestampMs = now
                            )
                        )
                    }
                }
                if (newFeedItems.isNotEmpty()) {
                    recentFeed = (newFeedItems.reversed() + recentFeed).take(30)
                }
                if (addedCount > 1) {
                    vm.toast("Scanned $addedCount items simultaneously", ToastType.SUCCESS)
                } else if (addedCount == 0 && notFoundCode != null) {
                    vm.toast("Barcode $notFoundCode not found", ToastType.WARNING)
                }
                if (!rapidMode && addedCount > 0) {
                    vm.closeScanner()
                }
            }

            ScannerMode.inventory -> {
                val (raw, _) = freshItems.first()
                val payload = PosMath.extractScanPayload(raw)
                val cleanCode = payload.code.ifBlank { raw.trim() }
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
                val (raw, _) = freshItems.first()
                val payload = PosMath.extractScanPayload(raw)
                val cleanCode = payload.code.ifBlank { raw.trim() }
                vm.openProductModal(editingId = vm.productModal.value.editingProduct?.id, initialBarcode = cleanCode)
                vm.closeScanner()
            }
        }
    }

    val photoPicker = rememberLauncherForActivityResult(ActivityResultContracts.PickVisualMedia()) { uri ->
        if (uri != null) {
            scope.launch {
                val decodedList = AndroidDeviceBridge.decodeAllBarcodesFromUri(context, uri, selectedSymbologies)
                if (decodedList.isNotEmpty()) {
                    processBatchBarcodes(decodedList)
                } else {
                    vm.toast("No barcode detected in image", ToastType.WARNING)
                }
            }
        }
    }

    val cameraController = remember(state.open) {
        LifecycleCameraController(context).apply {
            isPinchToZoomEnabled = true
            isTapToFocusEnabled = true
            imageAnalysisBackpressureStrategy = ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST
            val selector = ResolutionSelector.Builder()
                .setAspectRatioStrategy(AspectRatioStrategy.RATIO_16_9_FALLBACK_AUTO_STRATEGY)
                .setResolutionStrategy(
                    ResolutionStrategy(
                        Size(1280, 720),
                        ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER
                    )
                )
                .build()
            imageAnalysisResolutionSelector = selector
        }
    }

    val analysisExecutor = remember(state.open) { Executors.newSingleThreadExecutor() }

    // Bind camera & lifecycle once when opened or camera lens changes
    LaunchedEffect(hasCameraPerm, useFrontCamera, state.open) {
        if (hasCameraPerm && state.open) {
            runCatching {
                cameraController.cameraSelector = if (useFrontCamera) {
                    CameraSelector.DEFAULT_FRONT_CAMERA
                } else {
                    CameraSelector.DEFAULT_BACK_CAMERA
                }
                cameraController.bindToLifecycle(lifecycleOwner)
                val info = cameraController.cameraInfo
                hasFlash = info?.hasFlashUnit() ?: !useFrontCamera
                if (!hasFlash && torchOn) {
                    torchOn = false
                    cameraController.enableTorch(false)
                }
                val zoomMax = info?.zoomState?.value?.maxZoomRatio ?: 4.0f
                maxZoom = zoomMax.coerceIn(1.5f, 6.0f)
            }
        }
    }

    // Configure ML Kit analyzer whenever selected symbologies or autoZoom changes
    DisposableEffect(hasCameraPerm, selectedSymbologies, autoZoomEnabled, state.open) {
        if (!hasCameraPerm || !state.open) {
            onDispose {}
        } else {
            val mainExecutor = ContextCompat.getMainExecutor(context)
            val scannerClient = BarcodeScannerEngine.buildClient(
                symbologies = selectedSymbologies,
                enableAutoZoom = autoZoomEnabled,
                maxZoomRatio = maxZoom,
                onZoomSuggested = { suggestedRatio ->
                    if (!autoZoomEnabled) return@buildClient false
                    val clamped = suggestedRatio.coerceIn(1.0f, maxZoom)
                    if (clamped > currentZoom + 0.12f) {
                        currentZoom = clamped
                        cameraController.setZoomRatio(clamped)
                    }
                    true
                }
            )

            val analyzer = MlKitAnalyzer(
                listOf(scannerClient),
                CameraController.COORDINATE_SYSTEM_VIEW_REFERENCED,
                mainExecutor
            ) { result ->
                val list = result?.getValue(scannerClient)
                if (list.isNullOrEmpty()) {
                    val now = System.currentTimeMillis()
                    if (overlayBarcodes.isNotEmpty() && now - lastOverlayClearCheckMs > 180L) {
                        lastOverlayClearCheckMs = now
                        overlayBarcodes = emptyList()
                    }
                    return@MlKitAnalyzer
                }

                lastOverlayClearCheckMs = System.currentTimeMillis()
                val mappedOverlays = ArrayList<DetectedOverlayBarcode>(list.size)
                val decodedBatch = ArrayList<Pair<String, String>>(list.size)

                for ((idx, barcode) in list.withIndex()) {
                    val box = barcode.boundingBox ?: continue
                    val raw = barcode.rawValue?.trim()
                    val fmtLabel = BarcodeSymbology.labelForMlKitFormat(barcode.format)
                    if (!raw.isNullOrEmpty()) {
                        decodedBatch.add(raw to fmtLabel)
                        val cleanCode = PosMath.extractScanPayload(raw).code.ifBlank { raw }
                        val prod = PosMath.findProductByBarcodeIndexed(cleanCode, barcodeIndex)
                        mappedOverlays.add(
                            DetectedOverlayBarcode(
                                key = "${cleanCode}_$idx",
                                rawValue = raw,
                                cleanCode = cleanCode,
                                formatLabel = fmtLabel,
                                boundingBox = box,
                                matchedProductName = prod?.name,
                                matchedPrice = prod?.retailPrice,
                                isPotentialOnly = false
                            )
                        )
                    } else {
                        mappedOverlays.add(
                            DetectedOverlayBarcode(
                                key = "potential_$idx",
                                rawValue = null,
                                cleanCode = "",
                                formatLabel = "Focusing",
                                boundingBox = box,
                                isPotentialOnly = true
                            )
                        )
                    }
                }

                overlayBarcodes = mappedOverlays
                if (decodedBatch.isNotEmpty()) {
                    processBatchBarcodes(decodedBatch)
                }
            }

            cameraController.setImageAnalysisAnalyzer(analysisExecutor, analyzer)
            onDispose {
                runCatching { cameraController.clearImageAnalysisAnalyzer() }
                runCatching { scannerClient.close() }
            }
        }
    }

    DisposableEffect(state.open) {
        onDispose {
            runCatching { cameraController.unbind() }
            runCatching { analysisExecutor.shutdown() }
        }
    }

    BackHandler { vm.closeScanner() }

    Surface(
        modifier = Modifier
            .fillMaxSize()
            .background(PosColors.Slate950)
            .systemBarsPadding(),
        color = PosColors.Slate950
    ) {
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val isTabletLayout = maxWidth >= 720.dp

            Column(modifier = Modifier.fillMaxSize()) {
                ScannerTopHeader(
                    selectedCount = selectedSymbologies.size,
                    formatsExpanded = formatsExpanded,
                    onToggleFormats = { formatsExpanded = !formatsExpanded },
                    torchOn = torchOn,
                    hasFlash = hasFlash,
                    onToggleTorch = {
                        torchOn = !torchOn
                        cameraController.enableTorch(torchOn)
                    },
                    onSwitchCamera = { useFrontCamera = !useFrontCamera },
                    onClose = { vm.closeScanner() }
                )

                SymbologySelectorDrawer(
                    visible = formatsExpanded,
                    selectedSymbologies = selectedSymbologies,
                    onSelectPreset = { selectedSymbologies = it },
                    onToggleSymbology = { sym ->
                        if (sym in selectedSymbologies && selectedSymbologies.size > 1) {
                            selectedSymbologies = selectedSymbologies - sym
                        } else if (sym !in selectedSymbologies) {
                            selectedSymbologies = selectedSymbologies + sym
                        }
                    }
                )

                @Composable
                fun ViewfinderArea(modifier: Modifier) {
                    Box(modifier = modifier) {
                        if (hasCameraPerm) {
                            AndroidView(
                                factory = { ctx ->
                                    PreviewView(ctx).apply {
                                        scaleType = PreviewView.ScaleType.FILL_CENTER
                                        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                                        controller = cameraController
                                    }
                                },
                                update = { previewView ->
                                    if (previewView.controller !== cameraController) {
                                        previewView.controller = cameraController
                                    }
                                },
                                modifier = Modifier.fillMaxSize()
                            )

                            LiveBarcodeOverlay(
                                detections = overlayBarcodes,
                                activeFormatsCount = selectedSymbologies.size,
                                modifier = Modifier.fillMaxSize()
                            )

                            CameraFloatingZoomBar(
                                currentZoom = currentZoom,
                                maxZoom = maxZoom,
                                autoZoomEnabled = autoZoomEnabled,
                                onSelectZoom = { z ->
                                    currentZoom = z
                                    cameraController.setZoomRatio(z)
                                },
                                onToggleAutoZoom = { autoZoomEnabled = !autoZoomEnabled },
                                modifier = Modifier
                                    .align(Alignment.BottomCenter)
                                    .padding(bottom = 14.dp)
                            )
                        } else {
                            Column(
                                modifier = Modifier.fillMaxSize().padding(24.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                                verticalArrangement = Arrangement.Center
                            ) {
                                Text(
                                    "Camera permission is required for live simultaneous barcode scanning.",
                                    color = Color.White,
                                    style = MaterialTheme.typography.titleSmall
                                )
                                Spacer(Modifier.height(10.dp))
                                Button(onClick = { camPermLauncher.launch(Manifest.permission.CAMERA) }) {
                                    Text("Grant Camera Access")
                                }
                            }
                        }
                    }
                }

                if (isTabletLayout) {
                    Row(modifier = Modifier.weight(1f).fillMaxWidth()) {
                        ViewfinderArea(modifier = Modifier.weight(1.35f).fillMaxHeight())
                        TabletScannerSidePanel(
                            mode = state.mode,
                            rapidMode = rapidMode,
                            onToggleRapidMode = { rapidMode = !rapidMode },
                            manualCode = manualCode,
                            onManualCodeChange = { manualCode = it },
                            onSubmitManual = {
                                if (manualCode.isNotBlank()) {
                                    processBatchBarcodes(listOf(manualCode.trim() to "Manual"))
                                    manualCode = ""
                                }
                            },
                            onPickPhoto = {
                                photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                            },
                            notFoundCode = notFoundCode,
                            onAddUnknownSku = { code ->
                                notFoundCode = null
                                vm.closeScanner()
                                vm.openProductModal(initialBarcode = code)
                            },
                            onDismissUnknown = { notFoundCode = null },
                            recentFeed = recentFeed,
                            onClearFeed = { recentFeed = emptyList() },
                            cart = cart,
                            cartTotals = cartTotals,
                            onChangeQty = { id, delta -> vm.changeCartQty(id, delta) },
                            onCheckout = { vm.closeScanner(); vm.openCheckout() },
                            modifier = Modifier.weight(1f).widthIn(min = 320.dp, max = 440.dp)
                        )
                    }
                } else {
                    ViewfinderArea(modifier = Modifier.weight(1f).fillMaxWidth())
                    ScannerControlsFooter(
                        mode = state.mode,
                        rapidMode = rapidMode,
                        onToggleRapidMode = { rapidMode = !rapidMode },
                        manualCode = manualCode,
                        onManualCodeChange = { manualCode = it },
                        onSubmitManual = {
                            if (manualCode.isNotBlank()) {
                                processBatchBarcodes(listOf(manualCode.trim() to "Manual"))
                                manualCode = ""
                            }
                        },
                        onPickPhoto = {
                            photoPicker.launch(PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly))
                        },
                        notFoundCode = notFoundCode,
                        onAddUnknownSku = { code ->
                            notFoundCode = null
                            vm.closeScanner()
                            vm.openProductModal(initialBarcode = code)
                        },
                        onDismissUnknown = { notFoundCode = null },
                        recentFeed = recentFeed,
                        onClearFeed = { recentFeed = emptyList() },
                        cart = cart,
                        cartTotals = cartTotals,
                        onCheckout = { vm.closeScanner(); vm.openCheckout() }
                    )
                }
            }
        }
    }
}

@Composable
private fun LiveBarcodeOverlay(
    detections: List<DetectedOverlayBarcode>,
    activeFormatsCount: Int,
    modifier: Modifier = Modifier
) {
    val density = LocalDensity.current

    Box(modifier = modifier) {
        // Subtle status pill showing live simultaneous detections
        val decodedCount = detections.count { !it.isPotentialOnly }
        Surface(
            modifier = Modifier.align(Alignment.TopStart).padding(12.dp),
            shape = RoundedCornerShape(999.dp),
            color = PosColors.Slate950.copy(alpha = 0.72f)
        ) {
            Text(
                text = when {
                    decodedCount > 1 -> "Live: $decodedCount barcodes simultaneous"
                    decodedCount == 1 -> "Live: 1 barcode locked"
                    else -> "Aim at 1–10 items • $activeFormatsCount types active"
                },
                color = if (decodedCount > 0) PosColors.Emerald500 else Color.White,
                fontSize = 11.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.padding(horizontal = 10.dp, vertical = 5.dp)
            )
        }

        // Bounding boxes drawn directly in PreviewView coordinates
        Canvas(modifier = Modifier.fillMaxSize()) {
            if (detections.isEmpty()) {
                // Soft center guide bracket when idle
                val boxW = (size.width * 0.72f).coerceIn(220f, 760f)
                val boxH = (size.height * 0.34f).coerceIn(140f, 380f)
                val left = (size.width - boxW) / 2f
                val top = (size.height - boxH) / 2f
                drawRoundRect(
                    color = PosColors.Emerald500.copy(alpha = 0.42f),
                    topLeft = Offset(left, top),
                    size = androidx.compose.ui.geometry.Size(boxW, boxH),
                    cornerRadius = CornerRadius(28f, 28f),
                    style = Stroke(
                        width = 4f,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(24f, 18f), 0f)
                    )
                )
            } else {
                detections.forEach { det ->
                    val rect = det.boundingBox
                    val boxColor = when {
                        det.isPotentialOnly -> Color.White.copy(alpha = 0.72f)
                        det.matchedProductName != null -> PosColors.Emerald500
                        else -> PosColors.Amber500
                    }
                    drawRoundRect(
                        color = boxColor,
                        topLeft = Offset(rect.left.toFloat(), rect.top.toFloat()),
                        size = androidx.compose.ui.geometry.Size(
                            rect.width().coerceAtLeast(16).toFloat(),
                            rect.height().coerceAtLeast(16).toFloat()
                        ),
                        cornerRadius = CornerRadius(14f, 14f),
                        style = if (det.isPotentialOnly) {
                            Stroke(width = 4f, pathEffect = PathEffect.dashPathEffect(floatArrayOf(12f, 10f), 0f))
                        } else {
                            Stroke(width = 6f)
                        }
                    )
                }
            }
        }

        // Floating labels anchored above decoded barcodes
        detections.filter { !it.isPotentialOnly }.take(10).forEach { det ->
            val topY = with(density) { (det.boundingBox.top - 26.dp.toPx()).toInt().coerceAtLeast(8) }
            val leftX = det.boundingBox.left.coerceAtLeast(8)
            Surface(
                modifier = Modifier
                    .offset { IntOffset(leftX, topY) }
                    .widthIn(max = 210.dp),
                shape = RoundedCornerShape(8.dp),
                color = if (det.matchedProductName != null) {
                    PosColors.Emerald600.copy(alpha = 0.92f)
                } else {
                    PosColors.Amber700.copy(alpha = 0.92f)
                }
            ) {
                Text(
                    text = if (det.matchedProductName != null) {
                        "${det.matchedProductName} • ${PosMath.formatPeso(det.matchedPrice ?: 0.0)}"
                    } else {
                        "${det.formatLabel}: ${det.cleanCode}"
                    },
                    color = Color.White,
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                )
            }
        }
    }
}
