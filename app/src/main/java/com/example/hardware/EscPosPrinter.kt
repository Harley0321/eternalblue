package com.example.hardware

import android.Manifest
import android.annotation.SuppressLint
import android.bluetooth.BluetoothAdapter
import android.bluetooth.BluetoothDevice
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.example.domain.PosMath
import com.example.model.ReadingReport
import com.example.model.SaleRecord
import com.example.model.StoreSettings
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.ByteArrayOutputStream
import java.io.OutputStream
import java.util.UUID

data class BluetoothPrinterSession(
    val deviceName: String = "Bluetooth Printer",
    val deviceAddress: String = "",
    val connected: Boolean = false
)

data class PairedPrinterDevice(
    val name: String,
    val address: String
)

object EscPosPrinter {
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")

    private var socket: BluetoothSocket? = null
    private var outputStream: OutputStream? = null
    private var session = BluetoothPrinterSession()

    fun getSession(): BluetoothPrinterSession =
        session.copy(connected = socket?.isConnected == true && outputStream != null)

    fun hasBluetoothPermission(context: Context): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    @SuppressLint("MissingPermission")
    fun listPairedPrinters(context: Context): Result<List<PairedPrinterDevice>> = runCatching {
        if (!hasBluetoothPermission(context)) {
            error("Bluetooth permission is required to list paired printers.")
        }
        val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
        val adapter: BluetoothAdapter = mgr?.adapter ?: error("Bluetooth is not supported on this device.")
        if (!adapter.isEnabled) error("Please enable Bluetooth in device settings first.")
        adapter.bondedDevices.orEmpty()
            .map { dev -> PairedPrinterDevice(dev.name ?: "Unnamed Printer", dev.address) }
            .sortedBy { it.name.lowercase() }
    }

    @SuppressLint("MissingPermission")
    suspend fun connectByAddress(context: Context, address: String): Result<BluetoothPrinterSession> =
        withContext(Dispatchers.IO) {
            runCatching {
                if (!hasBluetoothPermission(context)) {
                    error("Bluetooth Connect permission is required.")
                }
                val mgr = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
                val adapter = mgr?.adapter ?: error("Bluetooth unavailable on this device.")
                val dev: BluetoothDevice = adapter.getRemoteDevice(address)
                disconnect()
                val sock = dev.createRfcommSocketToServiceRecord(SPP_UUID)
                adapter.cancelDiscovery()
                sock.connect()
                socket = sock
                outputStream = sock.outputStream
                session = BluetoothPrinterSession(
                    deviceName = dev.name ?: "Thermal Printer",
                    deviceAddress = dev.address,
                    connected = true
                )
                session
            }
        }

    fun disconnect() {
        runCatching { outputStream?.close() }
        runCatching { socket?.close() }
        outputStream = null
        socket = null
        session = BluetoothPrinterSession()
    }

    suspend fun sendBytes(bytes: ByteArray): Result<Unit> = withContext(Dispatchers.IO) {
        runCatching {
            val out = outputStream
            if (socket?.isConnected != true || out == null) {
                error("No Bluetooth thermal printer connected.")
            }
            val chunkSize = 180
            var offset = 0
            while (offset < bytes.size) {
                val end = (offset + chunkSize).coerceAtMost(bytes.size)
                out.write(bytes, offset, end - offset)
                out.flush()
                offset = end
            }
        }
    }

    private fun asciiLine(text: String): String {
        val sb = StringBuilder(text.length)
        for (ch in text) {
            when {
                ch == '₱' -> sb.append('P')
                ch.code in 0x20..0x7E -> sb.append(ch)
                else -> sb.append(' ')
            }
        }
        return sb.toString()
    }

    private fun padPair(left: String, right: String, cols: Int): String {
        val l = asciiLine(left)
        val r = asciiLine(right)
        val spaces = (cols - l.length - r.length).coerceAtLeast(1)
        return (l + " ".repeat(spaces) + r).take(cols)
    }

    private fun writeLines(out: ByteArrayOutputStream, lines: List<String>) {
        if (lines.isEmpty()) return
        val joined = lines.joinToString("\n") + "\n"
        for (ch in joined) {
            out.write(ch.code and 0x7F)
        }
    }

    fun buildCashDrawerKick(): ByteArray =
        byteArrayOf(0x1B, 0x40, 0x1B, 0x70, 0x00, 0x19, 0xFA.toByte())

    fun buildReceiptBytes(
        sale: SaleRecord? = null,
        reading: ReadingReport? = null,
        settings: StoreSettings,
        width: String = settings.receiptWidth,
        kickDrawer: Boolean = false
    ): ByteArray {
        val cols = if (width == "58mm") 32 else 48
        val sep = "-".repeat(cols)
        val out = ByteArrayOutputStream()

        out.write(byteArrayOf(0x1B, 0x40)) // ESC @
        out.write(byteArrayOf(0x1B, 0x61, 0x01)) // center
        out.write(byteArrayOf(0x1B, 0x45, 0x01)) // bold on
        writeLines(out, listOf(asciiLine(settings.storeName.uppercase())))
        out.write(byteArrayOf(0x1B, 0x45, 0x00)) // bold off

        val headerLines = listOfNotNull(
            settings.storeTagline?.takeIf { it.isNotBlank() }?.let(::asciiLine),
            asciiLine(settings.storeAddress).takeIf { it.isNotBlank() },
            asciiLine(settings.storeTin).takeIf { it.isNotBlank() },
            settings.storePhone.takeIf { it.isNotBlank() }?.let { "Tel: ${asciiLine(it)}" }
        )
        writeLines(out, headerLines)
        out.write(byteArrayOf(0x1B, 0x61, 0x00)) // left
        writeLines(out, listOf(sep))

        if (sale != null) {
            val body = mutableListOf(
                padPair("Receipt:", sale.receiptNo, cols),
                padPair("Date:", sale.dateFormatted, cols)
            )
            sale.cashierName?.takeIf { it.isNotBlank() }?.let { body.add(padPair("Cashier:", it, cols)) }
            sale.customerName?.takeIf { it.isNotBlank() }?.let { body.add(padPair("Suki:", it, cols)) }
            if (sale.voided == true) {
                body.add("*** VOIDED (${asciiLine(sale.voidReason ?: "Cancelled")}) ***")
            }
            body.add(sep)
            for (it in sale.items) {
                body.add(asciiLine(it.name).take(cols))
                body.add(
                    padPair(
                        " ${PosMath.formatQty(it.qty, it.unit)} x ${PosMath.formatPeso(it.unitPrice)}",
                        PosMath.formatPeso(it.lineTotal),
                        cols
                    )
                )
            }
            body.add(sep)
            body.add(padPair("Retail Subtotal", PosMath.formatPeso(sale.retailSubtotal), cols))
            if (sale.wholesaleSavings > 0.0) {
                body.add(padPair("Wholesale Savings", "-${PosMath.formatPeso(sale.wholesaleSavings)}", cols))
            }
            if (sale.seniorDiscount > 0.0) {
                body.add(padPair("SC/PWD 5% Disc", "-${PosMath.formatPeso(sale.seniorDiscount)}", cols))
            }
            if ((sale.pointsDiscount ?: 0.0) > 0.0) {
                body.add(padPair("Suki Points Disc", "-${PosMath.formatPeso(sale.pointsDiscount)}", cols))
            }
            body.add(padPair("TOTAL DUE", PosMath.formatPeso(sale.grandTotal), cols))
            body.add(padPair("Paid (${sale.paymentMethod})", PosMath.formatPeso(sale.tendered), cols))
            if (sale.change > 0.0) body.add(padPair("Change", PosMath.formatPeso(sale.change), cols))
            sale.utangDueDate?.takeIf { it.isNotBlank() }?.let { body.add(padPair("Utang Due Date", it, cols)) }
            sale.refNo?.takeIf { it.isNotBlank() }?.let { body.add(padPair("Ref #", it, cols)) }
            body.add(sep)
            writeLines(out, body)
            out.write(byteArrayOf(0x1B, 0x61, 0x01))
            writeLines(out, listOf(asciiLine(settings.receiptFooter.ifBlank { "Thank you!" })))
        } else if (reading != null) {
            val body = mutableListOf(asciiLine(reading.title), asciiLine(reading.subtitle), sep)
            for (l in reading.lines) {
                body.add(padPair(l.label, l.value, cols))
            }
            body.add(sep)
            writeLines(out, body)
        }

        out.write(byteArrayOf(0x1B, 0x64, 0x04)) // feed 4
        out.write(byteArrayOf(0x1D, 0x56, 0x42, 0x00)) // cut
        if (kickDrawer) {
            out.write(byteArrayOf(0x1B, 0x70, 0x00, 0x19, 0xFA.toByte()))
        }
        return out.toByteArray()
    }

    fun buildTestSlip(settings: StoreSettings, width: String = settings.receiptWidth): ByteArray {
        return buildReceiptBytes(
            reading = ReadingReport(
                title = "ESC/POS BLUETOOTH TEST",
                subtitle = "$width Thermal Printer Ready",
                lines = listOf(
                    com.example.model.ReadingLine("Store", settings.storeName),
                    com.example.model.ReadingLine("Paper Width", width),
                    com.example.model.ReadingLine("Currency", "PHP (P)"),
                    com.example.model.ReadingLine("Status", "OK")
                )
            ),
            settings = settings,
            width = width
        )
    }

    fun buildPlainTextReceipt(sale: SaleRecord?, reading: ReadingReport?, settings: StoreSettings): String {
        val sb = StringBuilder()
        sb.append(settings.storeName).append('\n')
        if (!settings.storeTagline.isNullOrBlank()) sb.append(settings.storeTagline).append('\n')
        sb.append(settings.storeAddress).append('\n')
        sb.append(settings.storeTin).append('\n')
        if (settings.storePhone.isNotBlank()) sb.append("Tel: ").append(settings.storePhone).append('\n')
        sb.append("--------------------------------\n")
        if (sale != null) {
            sb.append("Receipt: ").append(sale.receiptNo).append('\n')
            sb.append("Date: ").append(sale.dateFormatted).append('\n')
            if (!sale.cashierName.isNullOrBlank()) sb.append("Cashier: ").append(sale.cashierName).append('\n')
            if (!sale.customerName.isNullOrBlank()) sb.append("Suki: ").append(sale.customerName).append('\n')
            if (sale.voided == true) sb.append("*** VOIDED: ").append(sale.voidReason ?: "").append(" ***\n")
            sb.append("--------------------------------\n")
            for (it in sale.items) {
                sb.append(it.name).append('\n')
                sb.append("  ${PosMath.formatQty(it.qty, it.unit)} x ${PosMath.formatPeso(it.unitPrice)} = ${PosMath.formatPeso(it.lineTotal)}\n")
            }
            sb.append("--------------------------------\n")
            sb.append("Subtotal: ${PosMath.formatPeso(sale.retailSubtotal)}\n")
            if (sale.wholesaleSavings > 0) sb.append("Wholesale: -${PosMath.formatPeso(sale.wholesaleSavings)}\n")
            if (sale.seniorDiscount > 0) sb.append("SC/PWD 5%: -${PosMath.formatPeso(sale.seniorDiscount)}\n")
            if ((sale.pointsDiscount ?: 0.0) > 0) sb.append("Points: -${PosMath.formatPeso(sale.pointsDiscount)}\n")
            sb.append("TOTAL: ${PosMath.formatPeso(sale.grandTotal)}\n")
            sb.append("Paid (${sale.paymentMethod}): ${PosMath.formatPeso(sale.tendered)}\n")
            if (sale.change > 0) sb.append("Change: ${PosMath.formatPeso(sale.change)}\n")
            if (!sale.refNo.isNullOrBlank()) sb.append("Ref #: ${sale.refNo}\n")
            sb.append("--------------------------------\n")
            sb.append(settings.receiptFooter.ifBlank { "Thank you!" }).append('\n')
        } else if (reading != null) {
            sb.append(reading.title).append('\n')
            sb.append(reading.subtitle).append('\n')
            sb.append("--------------------------------\n")
            for (l in reading.lines) {
                sb.append("${l.label}: ${l.value}\n")
            }
        }
        return sb.toString()
    }
}
