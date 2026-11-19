package com.example.ui.modals

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.rounded.Send
import androidx.compose.material.icons.rounded.AutoAwesome
import androidx.compose.material.icons.rounded.Close
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.domain.AssistantContext
import com.example.domain.AssistantEngine
import com.example.domain.AssistantLang
import com.example.domain.AssistantTone
import com.example.domain.PosMath
import com.example.ui.theme.PosColors
import com.example.viewmodel.PosViewModel

@Composable
fun AssistantSheet(vm: PosViewModel) {
    val open by vm.assistantOpen.collectAsStateWithLifecycle()
    if (!open) return

    val messages by vm.assistantMessages.collectAsStateWithLifecycle()
    val products by vm.products.collectAsStateWithLifecycle()
    val sales by vm.sales.collectAsStateWithLifecycle()
    val heldOrders by vm.heldOrders.collectAsStateWithLifecycle()
    val settings by vm.settings.collectAsStateWithLifecycle()
    val cart by vm.cart.collectAsStateWithLifecycle()

    var lang by remember { mutableStateOf(AssistantLang.en) }
    var input by remember { mutableStateOf("") }

    val pulse = remember(products, sales, heldOrders, settings, cart) {
        AssistantEngine.computeStorePulse(
            AssistantContext(products, sales, heldOrders, settings, cart)
        )
    }

    Dialog(onDismissRequest = { vm.closeAssistant() }, properties = DialogProperties(usePlatformDefaultWidth = false)) {
        BackHandler { vm.closeAssistant() }
        Surface(
            color = PosColors.Slate100,
            modifier = Modifier.fillMaxSize().systemBarsPadding()
        ) {
            Column(modifier = Modifier.fillMaxSize()) {
                // Header with Live Store Pulse
                Surface(color = PosColors.Slate950, contentColor = Color.White) {
                    Column(modifier = Modifier.fillMaxWidth().padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Icon(Icons.Rounded.AutoAwesome, contentDescription = null, tint = PosColors.Indigo600)
                                Column {
                                    Text("Store AI Assistant (100% Offline)", style = MaterialTheme.typography.titleMedium, color = Color.White)
                                    Text("Health ${pulse.healthScore}/100 · Today ${PosMath.formatPeso(pulse.todayNet)}", fontSize = 11.sp, color = PosColors.Emerald500)
                                }
                            }
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                FilterChip(
                                    selected = lang == AssistantLang.tl,
                                    onClick = {
                                        lang = if (lang == AssistantLang.en) AssistantLang.tl else AssistantLang.en
                                        vm.resetAssistant(lang)
                                    },
                                    label = { Text(if (lang == AssistantLang.tl) "TL" else "EN", fontSize = 11.sp) }
                                )
                                IconButton(onClick = { vm.resetAssistant(lang) }) {
                                    Icon(Icons.Rounded.Refresh, contentDescription = "Reset chat", tint = PosColors.Slate300)
                                }
                                IconButton(onClick = { vm.closeAssistant() }, modifier = Modifier.testTag("assistant_close_btn")) {
                                    Icon(Icons.Rounded.Close, contentDescription = "Close assistant", tint = Color.White)
                                }
                            }
                        }
                    }
                }

                // Messages Feed
                LazyColumn(
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(12.dp),
                    verticalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    items(messages, key = { it.id }) { msg ->
                        if (msg.isUser) {
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                                Surface(shape = RoundedCornerShape(14.dp), color = PosColors.Indigo600) {
                                    Text(msg.userText ?: "", color = Color.White, modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp))
                                }
                            }
                        } else if (msg.reply != null) {
                            val reply = msg.reply
                            Surface(
                                shape = RoundedCornerShape(14.dp),
                                color = Color.White,
                                border = BorderStroke(1.dp, PosColors.Slate200),
                                modifier = Modifier.fillMaxWidth()
                            ) {
                                Column(modifier = Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Text(reply.text, style = MaterialTheme.typography.bodyMedium, color = PosColors.Slate900)

                                    if (reply.metrics.isNotEmpty()) {
                                        Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            reply.metrics.forEach { m ->
                                                val c = when (m.tone) {
                                                    AssistantTone.emerald -> PosColors.Emerald700
                                                    AssistantTone.amber -> PosColors.Amber700
                                                    AssistantTone.rose -> PosColors.Rose700
                                                    AssistantTone.indigo -> PosColors.Indigo700
                                                    AssistantTone.neutral -> PosColors.Slate800
                                                }
                                                Surface(shape = RoundedCornerShape(10.dp), color = PosColors.Slate50, border = BorderStroke(1.dp, PosColors.Slate200)) {
                                                    Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp)) {
                                                        Text(m.label, fontSize = 10.sp, color = PosColors.Slate500)
                                                        Text(m.value, fontWeight = FontWeight.ExtraBold, color = c, fontSize = 14.sp)
                                                        m.hint?.let { Text(it, fontSize = 10.sp, color = PosColors.Slate500) }
                                                    }
                                                }
                                            }
                                        }
                                    }

                                    reply.bars.forEach { bar ->
                                        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                                Text(bar.label, fontSize = 11.sp, color = PosColors.Slate700)
                                                Text(bar.valueText, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                                            }
                                            LinearProgressIndicator(progress = { (bar.pct / 100f).coerceIn(0f, 1f) }, modifier = Modifier.fillMaxWidth().height(6.dp))
                                        }
                                    }

                                    if (reply.actions.isNotEmpty()) {
                                        Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            reply.actions.forEach { act ->
                                                Button(
                                                    onClick = { vm.executeAssistantAction(act) },
                                                    colors = ButtonDefaults.buttonColors(containerColor = PosColors.Slate900),
                                                    contentPadding = PaddingValues(horizontal = 10.dp, vertical = 4.dp),
                                                    shape = RoundedCornerShape(10.dp)
                                                ) { Text(act.label, fontSize = 11.sp) }
                                            }
                                        }
                                    }

                                    if (reply.chips.isNotEmpty()) {
                                        Row(modifier = Modifier.horizontalScroll(rememberScrollState()), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                                            reply.chips.forEach { chip ->
                                                FilterChip(
                                                    selected = false,
                                                    onClick = { vm.askAssistant(chip, lang) },
                                                    label = { Text(chip, fontSize = 11.sp) }
                                                )
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Bottom Input Bar
                Surface(color = Color.White, shadowElevation = 4.dp) {
                    Row(
                        modifier = Modifier.fillMaxWidth().padding(10.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        OutlinedTextField(
                            value = input,
                            onValueChange = { input = it },
                            placeholder = { Text(if (lang == AssistantLang.tl) "Magtanong tungkol sa benta o stock..." else "Ask sales, stockout forecast, prices...", fontSize = 13.sp) },
                            singleLine = true,
                            shape = RoundedCornerShape(14.dp),
                            modifier = Modifier.weight(1f).testTag("assistant_input")
                        )
                        Button(
                            onClick = {
                                if (input.isNotBlank()) {
                                    vm.askAssistant(input, lang)
                                    input = ""
                                }
                            },
                            colors = ButtonDefaults.buttonColors(containerColor = PosColors.Indigo600),
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.size(48.dp).testTag("assistant_send_btn"),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Icon(Icons.AutoMirrored.Rounded.Send, contentDescription = "Send prompt")
                        }
                    }
                }
            }
        }
    }
}
