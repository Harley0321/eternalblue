package com.example.ui.screens

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.hardware.AndroidDeviceBridge
import com.example.ui.theme.EmeraldPrimary
import com.example.ui.theme.IndigoAccent
import com.example.ui.theme.RoseDanger
import com.example.ui.theme.SlateBorder
import com.example.ui.theme.SlateMuted
import com.example.viewmodel.PosUiState
import com.example.viewmodel.PosViewModel

@Composable
fun SettingsSecuritySection(state: PosUiState, vm: PosViewModel) {
    val context = LocalContext.current
    var confirmReset by remember { mutableStateOf(false) }

    Card(shape = RoundedCornerShape(14.dp), colors = CardDefaults.cardColors(containerColor = Color.White), border = BorderStroke(1.dp, SlateBorder)) {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(14.dp)) {
            Text("Security Vault & Backups", fontWeight = FontWeight.ExtraBold, fontSize = 15.sp)
            Text(
                if (state.pinConfigured) "Manager PIN is active (salted PBKDF2-HMAC-SHA256, ${state.settings.adminPinIter} iterations + lockout)." else "No Manager PIN configured yet. Set a 4–8 digit PIN to protect Settings and Voids.",
                fontSize = 12.sp,
                color = SlateMuted
            )
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = { vm.openPinModal("setPin") },
                    colors = ButtonDefaults.buttonColors(containerColor = IndigoAccent),
                    modifier = Modifier.weight(1f)
                ) {
                    Text(if (state.pinConfigured) "Change PIN" else "Set Manager PIN", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                if (state.pinConfigured) {
                    OutlinedButton(onClick = { vm.lockSettingsNow() }, modifier = Modifier.weight(1f)) {
                        Text("Lock Settings", fontSize = 12.sp)
                    }
                }
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
                Button(
                    onClick = {
                        val json = vm.exportBackupJson()
                        AndroidDeviceBridge.shareTextFile(context, "eternalblue_backup.json", json, "application/json")
                        vm.toast("Backup JSON ready to save or share")
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = EmeraldPrimary),
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Export Backup JSON", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                }
                OutlinedButton(
                    onClick = { confirmReset = true },
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = RoseDanger),
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Factory Reset", fontSize = 12.sp)
                }
            }
            Text("Security Audit Entries: ${state.securityLog.size}", fontSize = 11.sp, color = SlateMuted)
        }
    }

    if (confirmReset) {
        AlertDialog(
            onDismissRequest = { confirmReset = false },
            title = { Text("Reset Store Data?", fontWeight = FontWeight.Bold) },
            text = { Text("This clears all sales and restores default Philippine retail seed data.") },
            confirmButton = {
                TextButton(onClick = {
                    confirmReset = false
                    vm.factoryResetAll()
                }) { Text("Reset", color = RoseDanger, fontWeight = FontWeight.Bold) }
            },
            dismissButton = {
                TextButton(onClick = { confirmReset = false }) { Text("Cancel") }
            }
        )
    }
}
