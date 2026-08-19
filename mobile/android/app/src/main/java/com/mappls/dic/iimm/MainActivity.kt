package com.mappls.dic.iimm

import android.Manifest
import android.net.Uri
import android.content.ContentValues
import android.os.Build
import android.provider.MediaStore
import android.os.Bundle
import androidx.core.content.FileProvider
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.io.File

private val Navy = Color(0xFF104685)
private val Sky = Color(0xFFEAF3FB)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent { MaterialTheme(colorScheme = lightColorScheme(primary = Navy, secondary = Color(0xFF1A7F4B), surfaceVariant = Sky)) { IimmApp() } }
    }
}

class AppViewModel : ViewModel() {
    var session by mutableStateOf<Session?>(null)
    var busy by mutableStateOf(false)
    var error by mutableStateOf<String?>(null)
    var demoUsers by mutableStateOf<List<User>>(emptyList())
    var records by mutableStateOf<List<JSONObject>>(emptyList())
    var dashboard by mutableStateOf<JSONObject?>(null)
    var mapData by mutableStateOf(MapData(emptyList(), emptyList(), emptyList()))
    var searchResults by mutableStateOf<List<JSONObject>>(emptyList())

    fun attach(store: SessionStore) { if (session == null) store.user()?.let { session = Session(store.token().orEmpty(), it, null) } }
    suspend fun demos(api: ApiClient) = load { demoUsers = jsonObjects(api.array("/api/demo-users")).map(User::from) }
    suspend fun login(api: ApiClient, id: String) = load { session = api.login(id) }
    suspend fun dashboard(api: ApiClient) = load { dashboard = api.obj("/api/dashboard") }
    suspend fun module(api: ApiClient, spec: ModuleSpec) = load { records = jsonObjects(api.array(spec.endpoint)) }
    suspend fun map(api: ApiClient) = load { mapData = parseMapData(api.obj("/api/gis/overview")) }
    suspend fun search(api: ApiClient, q: String) = load { searchResults = if (q.length < 2) emptyList() else jsonObjects(api.array("/api/search?q=${java.net.URLEncoder.encode(q,"UTF-8")}")) }
    suspend fun action(block: suspend () -> Unit) = load(block)
    private suspend fun load(block: suspend () -> Unit) { busy=true; error=null; try { block() } catch (e:Exception) { error=e.message ?: "Unable to complete the request" } finally { busy=false } }
}

private fun jsonObjects(array: JSONArray) = (0 until array.length()).mapNotNull(array::optJSONObject)

@Composable
fun IimmApp(vm: AppViewModel = viewModel()) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val store = remember { SessionStore(context) }
    val api = remember { ApiClient(store) }
    vm.attach(store)
    Surface(Modifier.fillMaxSize()) {
        if (vm.session == null) LoginScreen(vm, api) else MainShell(vm, api) { store.clear(); vm.session=null }
    }
    vm.error?.let { message -> AlertDialog(onDismissRequest={vm.error=null}, confirmButton={TextButton(onClick={vm.error=null}){Text("OK")}}, title={Text("IIMM")}, text={Text(message)}) }
}

@Composable
private fun LoginScreen(vm: AppViewModel, api: ApiClient) {
    val scope=rememberCoroutineScope()
    LaunchedEffect(Unit) { vm.demos(api) }
    Column(Modifier.fillMaxSize().padding(24.dp), verticalArrangement=Arrangement.Center) {
        Surface(color=Navy,shape=RoundedCornerShape(18.dp),modifier=Modifier.size(64.dp)){Box(contentAlignment=Alignment.Center){Text("DI",color=Color.White,fontWeight=FontWeight.Bold,style=MaterialTheme.typography.headlineSmall)}}
        Spacer(Modifier.height(20.dp)); Text("IIMM Platform",style=MaterialTheme.typography.displaySmall,fontWeight=FontWeight.Bold); Text("Native field and governance application",color=Color.Gray)
        Spacer(Modifier.height(28.dp)); Text("Choose a demo role",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.SemiBold)
        Spacer(Modifier.height(10.dp))
        LazyColumn(verticalArrangement=Arrangement.spacedBy(10.dp),modifier=Modifier.heightIn(max=430.dp)) {
            items(vm.demoUsers,key={it.id}) { user -> ElevatedCard(onClick={scope.launch { vm.login(api,user.id) }},modifier=Modifier.fillMaxWidth()) { Row(Modifier.padding(16.dp),verticalAlignment=Alignment.CenterVertically){Icon(Icons.Outlined.AccountCircle,null,tint=Navy);Spacer(Modifier.width(12.dp));Column(Modifier.weight(1f)){Text(user.name,fontWeight=FontWeight.Bold);Text(user.role.label,color=Color.Gray)};Icon(Icons.Outlined.ChevronRight,null)} } }
        }
        if(vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth().padding(top=16.dp))
    }
}

private enum class Tab { HOME, MODULES, MAP, SEARCH, MORE }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(vm: AppViewModel, api: ApiClient, logout:()->Unit) {
    var tab by remember { mutableStateOf(Tab.HOME) }
    var module by remember { mutableStateOf<ModuleSpec?>(null) }
    val user=vm.session!!.user
    Scaffold(
        topBar={TopAppBar(title={Column{Text(module?.title ?: "IIMM Platform",fontWeight=FontWeight.Bold);Text(user.role.label,style=MaterialTheme.typography.labelSmall,color=Color.Gray)}},navigationIcon={if(module!=null){IconButton(onClick={module=null}){Icon(Icons.Outlined.ArrowBack,"Back")}}})},
        bottomBar={if(module==null) NavigationBar { listOf(Tab.HOME to Icons.Outlined.Home,Tab.MODULES to Icons.Outlined.Apps,Tab.MAP to Icons.Outlined.Map,Tab.SEARCH to Icons.Outlined.Search,Tab.MORE to Icons.Outlined.MoreHoriz).forEach{(item,icon)->NavigationBarItem(selected=tab==item,onClick={tab=item},icon={Icon(icon,item.name)},label={Text(item.name.lowercase().replaceFirstChar(Char::uppercase))})} }},
    ) { padding -> Box(Modifier.padding(padding).fillMaxSize()) {
        if(module!=null) ModuleScreen(vm,api,module!!)
        else when(tab){Tab.HOME->HomeScreen(vm,api){module=it};Tab.MODULES->ModulesScreen(user.role){module=it};Tab.MAP->FieldMapScreen(vm,api);Tab.SEARCH->SearchScreen(vm,api);Tab.MORE->MoreScreen(vm,api,logout)}
        if(vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
    } }
}

@Composable
private fun HomeScreen(vm:AppViewModel,api:ApiClient,open:(ModuleSpec)->Unit){
    val scope=rememberCoroutineScope();LaunchedEffect(Unit){vm.dashboard(api)};val data=vm.dashboard
    LazyColumn(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
        item{Text("Good day, ${vm.session!!.user.name.substringBefore(' ')}",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold);Text(vm.session!!.tenantName ?: "Integrated infrastructure operations",color=Color.Gray)}
        val kpis=data?.optJSONArray("kpis")?.let(::jsonObjects).orEmpty();items(kpis.chunked(2)){row->Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){row.forEach{item->ElevatedCard(Modifier.weight(1f)){Column(Modifier.padding(16.dp)){Text(item.optString("value"),style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold,color=Navy);Text(item.optString("label"),style=MaterialTheme.typography.bodySmall)}}};if(row.size==1)Spacer(Modifier.weight(1f))}}
        item{Text("Priority work",style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold)}
        items(MODULES.filter{vm.session!!.user.role in it.roles}.take(5)){spec->ElevatedCard(onClick={open(spec)},modifier=Modifier.fillMaxWidth()){ListItem(headlineContent={Text(spec.title,fontWeight=FontWeight.SemiBold)},supportingContent={Text(spec.subtitle)},leadingContent={Icon(Icons.Outlined.TaskAlt,null,tint=Navy)},trailingContent={Icon(Icons.Outlined.ChevronRight,null)})}}
        item{OutlinedButton(onClick={scope.launch{vm.dashboard(api)}},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.Refresh,null);Spacer(Modifier.width(8.dp));Text("Refresh dashboard")}}
    }
}

@Composable
private fun ModulesScreen(role:Role,open:(ModuleSpec)->Unit){LazyColumn(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){item{Text("All capabilities",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold);Text("Actions are enforced by role and tenant on the server.",color=Color.Gray)};items(MODULES.filter{role in it.roles}){spec->ElevatedCard(onClick={open(spec)},modifier=Modifier.fillMaxWidth()){Row(Modifier.padding(16.dp),verticalAlignment=Alignment.CenterVertically){Icon(moduleIcon(spec.key),null,tint=Navy);Spacer(Modifier.width(14.dp));Column(Modifier.weight(1f)){Text(spec.title,fontWeight=FontWeight.Bold);Text(spec.subtitle,style=MaterialTheme.typography.bodySmall,color=Color.Gray)};Icon(Icons.Outlined.ChevronRight,null)}}}}}

private fun moduleIcon(key:String)=when(key){"projects"->Icons.Outlined.AccountTree;"assets"->Icons.Outlined.Inventory2;"gis"->Icons.Outlined.Layers;"attendance"->Icons.Outlined.MyLocation;"inspections"->Icons.Outlined.FactCheck;"defects"->Icons.Outlined.Build;"payments"->Icons.Outlined.Payments;"tickets"->Icons.Outlined.SupportAgent;"notifications"->Icons.Outlined.Notifications;"sync"->Icons.Outlined.Sync;else->Icons.Outlined.ListAlt}

@Composable
private fun ModuleScreen(vm:AppViewModel,api:ApiClient,spec:ModuleSpec){
    val scope=rememberCoroutineScope();var dialog by remember{mutableStateOf(false)};var atrRecord by remember{mutableStateOf<JSONObject?>(null)};var pendingAtr by remember{mutableStateOf<JSONObject?>(null)};var inspectionRecord by remember{mutableStateOf<JSONObject?>(null)};var ticketRecord by remember{mutableStateOf<JSONObject?>(null)};val context=androidx.compose.ui.platform.LocalContext.current;val location=remember{LocationController(context)};val queue=remember{OfflineQueue(context)}
    val attendancePermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){grants->if(grants.values.any{it})scope.launch{vm.action{val sessions=SessionStore(context);val projectId=runCatching{jsonObjects(api.array("/api/projects")).firstOrNull()?.getString("id")}.getOrNull()?:sessions.projectId()?:error("Connect once to cache an assigned project before marking attendance offline.");sessions.saveProjectId(projectId);val gps=location.current()?:error("Current GPS could not be acquired.");val body=JSONObject().put("projectId",projectId).put("lat",gps.latitude).put("lng",gps.longitude).put("accuracyMeters",gps.accuracy.toDouble()).put("offline",false);try{api.post("/api/attendance",body)}catch(e:java.io.IOException){if(e is ApiException)throw e;queue.enqueue("Attendance","local-att-${System.currentTimeMillis()}",body.put("offline",true))};runCatching{vm.module(api,spec)}}}}
    val evidenceLocationPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){grants->if(grants.values.any{it})dialog=true else vm.error="Location access is required for geo-tagged evidence."}
    val atrLocationPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){grants->if(grants.values.any{it})atrRecord=pendingAtr else vm.error="Location access is required for a geo-tagged ATR."}
    LaunchedEffect(spec.key){vm.module(api,spec)}
    Scaffold(floatingActionButton={if(spec.createKind!=null&&canCreate(vm.session!!.user.role,spec.key))FloatingActionButton(onClick={when(spec.key){"attendance"->attendancePermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION));"defects"->evidenceLocationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION));else->dialog=true}}){Icon(if(spec.key=="attendance")Icons.Outlined.MyLocation else Icons.Outlined.Add,"Create")}}){padding->
        LazyColumn(Modifier.padding(padding).fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
            item{Text(spec.subtitle,color=Color.Gray);Spacer(Modifier.height(4.dp));Text("${vm.records.size} records",style=MaterialTheme.typography.labelLarge,color=Navy)}
            if(vm.records.isEmpty()&&!vm.busy)item{EmptyState("No records are visible for this role and tenant.")}
            items(vm.records,key={it.optString("id",it.toString().hashCode().toString())}){record->RecordCard(record,spec.key,vm.session!!.user.role){path,body->when(path){
                "local:atr"->{pendingAtr=record;atrLocationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))}
                "local:inspection"->inspectionRecord=record
                "local:ticket"->ticketRecord=record
                else->scope.launch{vm.action{applyRecordAction(record,spec,path,body,vm,api,queue)}}
            }}}
            item{Spacer(Modifier.height(80.dp))}
        }
    }
    if(dialog)CreateDialog(spec.key,vm,api,onDismiss={dialog=false}){scope.launch{vm.action{createRecord(spec.key,it,vm,api);vm.module(api,spec);dialog=false}}}
    atrRecord?.let{record->AtrDialog(onDismiss={atrRecord=null}){summary,uri->scope.launch{vm.action{submitAtr(record,summary,uri,api,context,queue);runCatching{vm.module(api,spec)};atrRecord=null}}}}
    inspectionRecord?.let{record->InspectionDialog(record,vm.session!!.user.role,onDismiss={inspectionRecord=null}){body->scope.launch{vm.action{applyRecordAction(record,spec,"/api/inspections/${record.getString("id")}",body,vm,api,queue);inspectionRecord=null}}}}
    ticketRecord?.let{record->TicketDialog(record,vm.session!!.user,onDismiss={ticketRecord=null}){body->scope.launch{vm.action{applyRecordAction(record,spec,"/api/tickets/${record.getString("id")}",body,vm,api,queue);ticketRecord=null}}}}
}

private suspend fun applyRecordAction(record:JSONObject,spec:ModuleSpec,path:String,body:JSONObject,vm:AppViewModel,api:ApiClient,queue:OfflineQueue){
    try { if(shouldPatch(path))api.patch(path,body) else api.post(path,body) }
    catch(e:java.io.IOException){
        if(e is ApiException)throw e
        val entity=when(spec.key){"inspections"->"Inspection";"defects"->"Defect";else->null}
        if(entity==null)throw e else queue.enqueue(entity,record.optString("id"),body)
    }
    runCatching{vm.module(api,spec)}
}

private fun shouldPatch(path:String)=Regex("^/api/(tenants|users|projects|assets|inspections|tickets)/[^/]+$").matches(path)

private fun canCreate(role:Role,key:String)=when(key){"tenants"->role==Role.TENANT_ADMIN;"users","projects","assets"->role in setOf(Role.TENANT_ADMIN,Role.AUTHORITY);"attendance","payments"->role==Role.MAKER;"inspections"->role in setOf(Role.AUTHORITY,Role.MAKER,Role.CHECKER);"defects","tickets"->true;else->false}

@Composable
private fun RecordCard(record:JSONObject,key:String,role:Role,action:(String,JSONObject)->Unit){ElevatedCard(Modifier.fillMaxWidth()){Column(Modifier.padding(16.dp)){Row(verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(record.displayTitle(),fontWeight=FontWeight.Bold);record.displaySubtitle().takeIf(String::isNotBlank)?.let{Text(it,color=Color.Gray,style=MaterialTheme.typography.bodySmall)}};record.optString("status").takeIf(String::isNotBlank)?.let{AssistChip(onClick={},label={Text(it)})}};val buttons=workflowButtons(record,key,role);if(buttons.isNotEmpty()){Spacer(Modifier.height(10.dp));Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){buttons.take(2).forEach{button->OutlinedButton(onClick={action(button.path,button.body)}){Text(button.label)}}}}}}}
private data class WorkflowButton(val label:String,val path:String,val body:JSONObject)
private fun workflowButtons(r:JSONObject,key:String,role:Role):List<WorkflowButton>{val id=r.optString("id");return when{
    key=="notifications"&&!r.optBoolean("read")->listOf(WorkflowButton("Mark read","/api/notifications/$id/read",JSONObject()))
    key=="defects"&&role==Role.CHECKER&&r.optString("checkerValidation")=="Pending"->listOf(WorkflowButton("Validate","/api/defects/$id/validate",JSONObject().put("decision","approve")),WorkflowButton("Reject","/api/defects/$id/validate",JSONObject().put("decision","reject")))
    key=="defects"&&role==Role.MAKER&&r.optString("status") in setOf("Assigned","Reopened")->listOf(WorkflowButton("Start work","/api/defects/$id/start",JSONObject().put("status","In Progress")))
    key=="defects"&&role==Role.MAKER&&r.optString("status")=="In Progress"->listOf(WorkflowButton("Submit ATR","local:atr",JSONObject()))
    key=="defects"&&role==Role.CHECKER&&r.optString("status")=="ATR Submitted"->listOf(WorkflowButton("Verify ATR","/api/defects/$id/verify-atr",JSONObject().put("decision","verify").put("note","Verified in native app")),WorkflowButton("Rework","/api/defects/$id/verify-atr",JSONObject().put("decision","rework").put("note","Further work required")))
    key=="defects"&&role==Role.CITIZEN&&r.optString("status") in setOf("Resolved","Closed")->listOf(WorkflowButton("Close · 5 stars","/api/defects/$id/feedback",JSONObject().put("rating",5).put("comment","Resolved satisfactorily in the native app").put("reopen",false)),WorkflowButton("Reopen","/api/defects/$id/feedback",JSONObject().put("rating",2).put("comment","The issue still requires attention").put("reopen",true)))
    key=="inspections"->listOf(WorkflowButton("Open checklist","local:inspection",JSONObject()))
    key=="tickets"->listOf(WorkflowButton("View & respond","local:ticket",JSONObject()))
    key=="tenants"&&role==Role.TENANT_ADMIN->listOf(WorkflowButton(if(r.optString("status")=="Live")"Deactivate" else "Set live","/api/tenants/$id",JSONObject().put("status",if(r.optString("status")=="Live")"Inactive" else "Live")))
    key=="users"&&role in setOf(Role.TENANT_ADMIN,Role.AUTHORITY)&&r.optString("role") !in setOf("tenant_admin","citizen")->listOf(WorkflowButton(if(r.optBoolean("active",true))"Deactivate" else "Activate","/api/users/$id",JSONObject().put("active",!r.optBoolean("active",true))))
    key=="projects"&&role==Role.AUTHORITY->{val next=(r.optInt("progress",0)+10).coerceAtMost(100);listOf(WorkflowButton(if(next==100)"Complete" else "Advance to $next%","/api/projects/$id",JSONObject().put("progress",next).put("status",if(next==100)"Completed" else "Active")))}
    key=="assets"&&role==Role.AUTHORITY->listOf(WorkflowButton(if(r.optString("condition")=="Attention")"Mark good" else "Needs attention","/api/assets/$id",JSONObject().put("condition",if(r.optString("condition")=="Attention")"Good" else "Attention")))
    key=="gis_imports"&&role==Role.AUTHORITY&&r.optString("status")=="Published"->listOf(WorkflowButton("Rollback import","/api/gis/imports/$id/rollback",JSONObject()))
    key=="payments"&&role==Role.CHECKER&&r.optString("status")=="Submitted"->listOf(WorkflowButton("Verify","/api/payments/$id/action",JSONObject().put("decision","approve").put("note","Verified in native app")),WorkflowButton("Reject","/api/payments/$id/action",JSONObject().put("decision","reject").put("note","Rejected in native app")))
    key=="payments"&&role==Role.AUTHORITY&&r.optString("status")=="Checker Verified"->listOf(WorkflowButton("Approve","/api/payments/$id/action",JSONObject().put("decision","approve").put("note","Approved in native app")),WorkflowButton("Reject","/api/payments/$id/action",JSONObject().put("decision","reject").put("note","Rejected in native app")))
    key=="sync"&&role in setOf(Role.CHECKER,Role.AUTHORITY)->listOf(WorkflowButton("Keep server","/api/sync/conflicts/$id/resolve",JSONObject().put("decision","keep-server").put("note","Compared the queued edit with the current server record in the native app.")),WorkflowButton("Accept reviewed client","/api/sync/conflicts/$id/resolve",JSONObject().put("decision","reviewed-client").put("note","Reviewed the queued client edit and accepted it for manual follow-up.")))
    else->emptyList()}}

private data class ChecklistDraft(val item:String,val status:String,val note:String)

@Composable
private fun InspectionDialog(record:JSONObject,role:Role,onDismiss:()->Unit,onAction:(JSONObject)->Unit){
    val editable=role in setOf(Role.MAKER,Role.CHECKER)
    val checklist=remember(record){mutableStateListOf<ChecklistDraft>().apply{record.optJSONArray("checklist")?.let{array->(0 until array.length()).forEach{i->array.optJSONObject(i)?.let{add(ChecklistDraft(it.optString("item","Checklist item"),it.optString("status","Pending"),it.optString("note")))}}}}}
    fun json()=JSONArray().also{array->checklist.forEach{entry->array.put(JSONObject().put("item",entry.item).put("status",entry.status).apply{if(entry.note.isNotBlank())put("note",entry.note)})}}
    val status=record.optString("status")
    AlertDialog(
        onDismissRequest=onDismiss,
        title={Text("${record.optString("id")} · Inspection")},
        text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
            Text("$status · ${record.optString("type")}",color=Navy,fontWeight=FontWeight.Bold)
            if(checklist.isEmpty())Text("No checklist items were configured for this inspection.",color=Color.Gray)
            LazyColumn(Modifier.heightIn(max=330.dp),verticalArrangement=Arrangement.spacedBy(8.dp)){
                itemsIndexed(checklist){index,entry->ElevatedCard(Modifier.fillMaxWidth()){Column(Modifier.padding(10.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){Text(entry.item,fontWeight=FontWeight.SemiBold);if(editable&&status in setOf("In Progress","Paused")){Row(horizontalArrangement=Arrangement.spacedBy(7.dp)){listOf("Pending","Pass","Flag").forEach{value->FilterChip(selected=entry.status==value,onClick={checklist[index]=entry.copy(status=value,note=if(value=="Flag"&&entry.note.isBlank())"Flagged during native field inspection" else if(value=="Pass")"" else entry.note)},label={Text(value)})}};if(entry.status=="Flag")OutlinedTextField(entry.note,{checklist[index]=entry.copy(note=it)},label={Text("Flag note")},modifier=Modifier.fillMaxWidth())}else Text(entry.status,style=MaterialTheme.typography.labelMedium,color=Color.Gray)}}}
            }
            if(editable){
                when(status){
                    "Scheduled"->Row(horizontalArrangement=Arrangement.spacedBy(6.dp)){OutlinedButton(onClick={onAction(JSONObject().put("status","Rejected"))}){Text("Reject")};OutlinedButton(onClick={onAction(JSONObject().put("status","Not Ready"))}){Text("Not ready")};Button(onClick={onAction(JSONObject().put("status","Accepted"))}){Text("Accept")}}
                    "Accepted"->Button(onClick={onAction(JSONObject().put("status","In Progress"))},modifier=Modifier.fillMaxWidth()){Text("Start inspection")}
                    "Paused"->Button(onClick={onAction(JSONObject().put("status","In Progress").put("checklist",json()))},modifier=Modifier.fillMaxWidth()){Text("Resume inspection")}
                    "In Progress"->Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){OutlinedButton(onClick={onAction(JSONObject().put("status","Paused").put("checklist",json()))},modifier=Modifier.weight(1f)){Text("Pause")};Button(onClick={onAction(JSONObject().put("status","Completed").put("checklist",json()))},enabled=checklist.none{it.status=="Pending"},modifier=Modifier.weight(1f)){Text("Complete")}}
                }
            }
        }},
        confirmButton={if(editable&&status in setOf("In Progress","Paused"))Button(onClick={onAction(JSONObject().put("checklist",json()))}){Text("Save checklist")}},
        dismissButton={TextButton(onClick=onDismiss){Text("Close")}},
    )
}

@Composable
private fun TicketDialog(record:JSONObject,user:User,onDismiss:()->Unit,onAction:(JSONObject)->Unit){
    var message by remember{mutableStateOf("")}
    val status=record.optString("status")
    val manager=user.role in setOf(Role.TENANT_ADMIN,Role.AUTHORITY,Role.CHECKER)
    val messages=record.optJSONArray("messages")?.let(::jsonObjects).orEmpty()
    val next=when(status){"Open","Reopened"->"Assigned";"Assigned"->"In Progress";"In Progress"->"Resolved";"Resolved"->"Closed";else->null}
    AlertDialog(
        onDismissRequest=onDismiss,
        title={Text("${record.optString("id")} · ${record.optString("subject")}")},
        text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){
            Text("${record.optString("priority")} priority · $status",color=Navy,fontWeight=FontWeight.Bold)
            LazyColumn(Modifier.heightIn(max=240.dp),verticalArrangement=Arrangement.spacedBy(7.dp)){items(messages.takeLast(8)){item->Surface(color=if(item.optString("by")==user.id)Sky else Color(0xFFF3F4F6),shape=RoundedCornerShape(10.dp)){Column(Modifier.padding(10.dp)){Text(if(item.optString("by")==user.id)"You" else item.optString("by"),fontWeight=FontWeight.Bold,style=MaterialTheme.typography.labelSmall);Text(item.optString("text"));Text(item.optString("at"),color=Color.Gray,style=MaterialTheme.typography.labelSmall)}}}}
            OutlinedTextField(message,{message=it},label={Text("Add update")},minLines=2,modifier=Modifier.fillMaxWidth())
            if(manager&&next!=null)OutlinedButton(onClick={onAction(JSONObject().put("status",next).put("message","Moved to $next from the native helpdesk."))},modifier=Modifier.fillMaxWidth()){Text("Move to $next")}
            if(!manager&&record.optString("raisedBy")==user.id&&status in setOf("Resolved","Closed"))OutlinedButton(onClick={onAction(JSONObject().put("status","Reopened").put("message","Resolution is not satisfactory; reopening for support."))},modifier=Modifier.fillMaxWidth()){Text("Reopen ticket")}
        }},
        confirmButton={Button(onClick={onAction(JSONObject().put("message",message.trim()))},enabled=message.trim().length>=2){Text("Send update")}},
        dismissButton={TextButton(onClick=onDismiss){Text("Close")}},
    )
}

@Composable private fun EmptyState(text:String){Surface(color=Sky,shape=RoundedCornerShape(16.dp)){Column(Modifier.fillMaxWidth().padding(28.dp),horizontalAlignment=Alignment.CenterHorizontally){Icon(Icons.Outlined.Inbox,null,tint=Navy,modifier=Modifier.size(40.dp));Spacer(Modifier.height(8.dp));Text(text)}}}

@Composable
private fun CreateDialog(kind:String,vm:AppViewModel,api:ApiClient,onDismiss:()->Unit,onCreate:(Map<String,String>)->Unit){
    val context=androidx.compose.ui.platform.LocalContext.current
    var first by remember{mutableStateOf("")};var second by remember{mutableStateOf("")};var third by remember{mutableStateOf("")}
    var evidence by remember{mutableStateOf<Uri?>(null)};var pendingCameraUri by remember{mutableStateOf<Uri?>(null)}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){evidence=it}
    val camera=rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()){ok->if(ok)evidence=pendingCameraUri}
    fun capture(){val dir=File(context.cacheDir,"field-evidence").apply{mkdirs()};val file=File(dir,"defect-${System.currentTimeMillis()}.jpg");pendingCameraUri=FileProvider.getUriForFile(context,"${context.packageName}.files",file);camera.launch(pendingCameraUri!!)}
    val labels=when(kind){"defects"->listOf("Issue title","Description","Severity (Low/Medium/High/Critical)");"tickets"->listOf("Subject","Description","Priority");"payments"->listOf("Invoice number","Amount","Attendance reference");"attendance"->listOf("Project ID",""," ");"projects"->listOf("Project code","Project name","Location");"assets"->listOf("Asset name","Asset type","Location");"users"->listOf("Full name","Email","Mobile");"tenants"->listOf("Organisation name","Short name","Organisation type");"inspections"->listOf("Project ID","Asset ID","Checker ID");else->listOf("Name","Description","")}
    AlertDialog(onDismissRequest=onDismiss,title={Text("Create ${kind.replaceFirstChar(Char::uppercase)}")},text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){OutlinedTextField(first,{first=it},label={Text(labels[0])});if(labels[1].isNotBlank())OutlinedTextField(second,{second=it},label={Text(labels[1])});if(labels[2].isNotBlank())OutlinedTextField(third,{third=it},label={Text(labels[2])});if(kind=="defects"){Button(onClick={capture()},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.PhotoCamera,null);Spacer(Modifier.width(8.dp));Text("Capture photo")};OutlinedButton(onClick={picker.launch(arrayOf("image/*","video/*"))},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.AttachFile,null);Spacer(Modifier.width(8.dp));Text("Choose photo or video")};if(evidence!=null)Text("Evidence ready",color=Color(0xFF1A7F4B),fontWeight=FontWeight.Bold)};Text("Related project/user assignments use the first eligible record in the active tenant when not entered.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)}},confirmButton={Button(enabled=first.isNotBlank()&&(kind!="defects"||evidence!=null),onClick={onCreate(mapOf("first" to first,"second" to second,"third" to third,"evidence" to (evidence?.toString().orEmpty())))}){Text("Submit")}},dismissButton={TextButton(onClick=onDismiss){Text("Cancel")}})
}

@Composable
private fun AtrDialog(onDismiss:()->Unit,onSubmit:(String,Uri)->Unit){
    val context=androidx.compose.ui.platform.LocalContext.current
    var summary by remember{mutableStateOf("")};var evidence by remember{mutableStateOf<Uri?>(null)};var pendingCameraUri by remember{mutableStateOf<Uri?>(null)}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){evidence=it}
    val camera=rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()){ok->if(ok)evidence=pendingCameraUri}
    fun capture(){val dir=File(context.cacheDir,"field-evidence").apply{mkdirs()};val file=File(dir,"atr-${System.currentTimeMillis()}.jpg");pendingCameraUri=FileProvider.getUriForFile(context,"${context.packageName}.files",file);camera.launch(pendingCameraUri!!)}
    AlertDialog(onDismissRequest=onDismiss,title={Text("Submit Action Taken Report")},text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){OutlinedTextField(summary,{summary=it},label={Text("Rectification summary")},minLines=3);Button(onClick={capture()},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.PhotoCamera,null);Spacer(Modifier.width(8.dp));Text("Capture photo")};OutlinedButton(onClick={picker.launch(arrayOf("image/*","video/*"))},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.AttachFile,null);Spacer(Modifier.width(8.dp));Text("Choose photo or video")};if(evidence!=null)Text("Evidence ready",color=Color(0xFF1A7F4B),fontWeight=FontWeight.Bold);Text("GPS, capture time and accuracy are stored with the evidence.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)}},confirmButton={Button(enabled=summary.length>=10&&evidence!=null,onClick={onSubmit(summary,evidence!!)}){Text("Submit ATR")}},dismissButton={TextButton(onClick=onDismiss){Text("Cancel")}})
}

private suspend fun submitAtr(record:JSONObject,summary:String,uri:Uri,api:ApiClient,context:android.content.Context,queue:OfflineQueue){
    val gps=LocationController(context).current()?:error("Current GPS could not be acquired.")
    val mime=context.contentResolver.getType(uri)?:"image/jpeg"
    val bytes=context.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("The selected evidence could not be read.")
    val extension=when(mime){"image/png"->"png";"image/webp"->"webp";"image/heic"->"heic";"video/mp4"->"mp4";"video/quicktime"->"mov";"video/webm"->"webm";else->"jpg"}
    val localId="local-atr-${System.currentTimeMillis()}"
    val fileName="iimm-atr-${System.currentTimeMillis()}.$extension"
    val payload=JSONObject().put("defectId",record.getString("id")).put("summary",summary).put("lat",gps.latitude).put("lng",gps.longitude).put("accuracyMeters",gps.accuracy.toDouble()).put("mimeType",mime).put("fileName",fileName)
    val media=try{api.uploadMedia(bytes,mime,fileName,gps.latitude,gps.longitude,gps.accuracy.toDouble())}catch(e:java.io.IOException){
        if(e is ApiException)throw e
        val directory=File(context.filesDir,"offline-evidence").apply{mkdirs()}
        val evidence=File(directory,"$localId.$extension").apply{writeBytes(bytes)}
        queue.enqueue("DefectAtrCreate",localId,payload.put("evidencePath",evidence.absolutePath))
        return
    }
    try{api.post("/api/defects/${record.getString("id")}/atr",JSONObject().put("summary",summary).put("media",JSONArray().put(media.getString("id"))).put("lat",gps.latitude).put("lng",gps.longitude).put("accuracyMeters",gps.accuracy.toDouble()))}catch(e:java.io.IOException){
        if(e is ApiException)throw e
        queue.enqueue("DefectAtrCreate",localId,payload.put("mediaId",media.getString("id")))
    }
}

private suspend fun createRecord(key:String,fields:Map<String,String>,vm:AppViewModel,api:ApiClient){
    if(key=="defects"){createDefectRecord(fields,api);return}
    val projects=jsonObjects(api.array("/api/projects"));val users=jsonObjects(api.array("/api/users"));val assets=jsonObjects(api.array("/api/assets"));val project=projects.firstOrNull();val checker=users.firstOrNull{it.optString("role")=="checker"};val authority=users.firstOrNull{it.optString("role")=="authority"};val maker=users.firstOrNull{it.optString("role")=="maker"}
    val body=when(key){
        "defects"->{
            val context=IimmApplication.instance
            val location=LocationController(context).current()?:error("Allow location access and wait for a GPS fix before reporting a defect.")
            val uri=Uri.parse(fields["evidence"].orEmpty())
            val mime=context.contentResolver.getType(uri)?:"image/jpeg"
            val bytes=context.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("The selected evidence could not be read.")
            val extension=when(mime){"image/png"->"png";"image/webp"->"webp";"image/heic"->"heic";"video/mp4"->"mp4";"video/quicktime"->"mov";"video/webm"->"webm";else->"jpg"}
            val media=api.uploadMedia(bytes,mime,"iimm-evidence-${System.currentTimeMillis()}.$extension",location.latitude,location.longitude,location.accuracy.toDouble())
            val address=runCatching{api.reverseGeocode(location.latitude,location.longitude)}.getOrDefault("${location.latitude}, ${location.longitude}")
            JSONObject().put("projectId",project?.optString("id")).put("assetId",JSONObject.NULL).put("title",fields["first"]).put("description",fields["second"]).put("location",address).put("lat",location.latitude).put("lng",location.longitude).put("severity",fields["third"].takeIf{it in listOf("Low","Medium","High","Critical")}?:"Medium").put("media",JSONArray().put(media.getString("id"))).put("locationAccuracyMeters",location.accuracy.toDouble())
        }
        "tickets"->JSONObject().put("category","Mobile app").put("priority",fields["third"].takeIf{it in listOf("Low","Medium","High","Critical")}?:"Medium").put("subject",fields["first"]).put("description",fields["second"])
        "payments"->JSONObject().put("projectId",project?.optString("id")).put("invoiceNo",fields["first"]).put("checkerId",checker?.optString("id")).put("authorityId",authority?.optString("id")).put("amount",fields["second"]?.toDoubleOrNull()?:1.0).put("attendanceReference",fields["third"]).put("inspectionReference","Native app claim")
        "projects"->JSONObject().put("code",fields["first"]).put("name",fields["second"]).put("location",fields["third"]).put("assetType","Road").put("makerIds",JSONArray()).put("checkerIds",JSONArray()).put("geofenceRadiusMeters",250)
        "assets"->JSONObject().put("projectId",project?.optString("id")).put("name",fields["first"]).put("type",fields["second"]).put("location",fields["third"]).put("condition","Good").put("attributes",JSONObject()).put("layerId",JSONObject.NULL)
        "users"->JSONObject().put("name",fields["first"]).put("email",fields["second"]).put("mobile",fields["third"]).put("role","maker").put("designation","Field user")
        "tenants"->JSONObject().put("name",fields["first"]).put("shortName",fields["second"]).put("type",fields["third"]).put("hierarchy","Head Office > Division > Site").put("modules",JSONArray(listOf("Asset Management","Attendance"))).put("assetTypes",JSONArray().put(JSONObject().put("name","Road").put("attributes",JSONArray()).put("checklist",JSONArray())))
        "inspections"->JSONObject().put("projectId",fields["first"].orEmpty().ifBlank{project?.optString("id").orEmpty()}).put("assetId",fields["second"].orEmpty().ifBlank{assets.firstOrNull()?.optString("id").orEmpty()}).put("type","Requested").put("makerId",maker?.optString("id")).put("checkerId",fields["third"].orEmpty().ifBlank{checker?.optString("id").orEmpty()}).put("scheduledAt",Instant.now().toString()).put("checklist",JSONArray())
        else->JSONObject()
    }
    if(key=="attendance")return
    api.post(when(key){"defects"->"/api/defects";"tickets"->"/api/tickets";"payments"->"/api/payments";"projects"->"/api/projects";"assets"->"/api/assets";"users"->"/api/users";"tenants"->"/api/tenants";"inspections"->"/api/inspections";else->error("Unsupported")},body)
}

private suspend fun createDefectRecord(fields:Map<String,String>,api:ApiClient){
    val context=IimmApplication.instance
    val gps=LocationController(context).current()?:error("Allow location access and wait for a GPS fix before reporting a defect.")
    val uri=Uri.parse(fields["evidence"].orEmpty())
    val mime=context.contentResolver.getType(uri)?:"image/jpeg"
    val bytes=context.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("The selected evidence could not be read.")
    val extension=when(mime){"image/png"->"png";"image/webp"->"webp";"image/heic"->"heic";"video/mp4"->"mp4";"video/quicktime"->"mov";"video/webm"->"webm";else->"jpg"}
    val localId="local-defect-${System.currentTimeMillis()}"
    val fileName="iimm-evidence-${System.currentTimeMillis()}.$extension"
    val payload=JSONObject()
        .put("projectId",JSONObject.NULL).put("assetId",JSONObject.NULL)
        .put("title",fields["first"]).put("description",fields["second"])
        .put("lat",gps.latitude).put("lng",gps.longitude).put("locationAccuracyMeters",gps.accuracy.toDouble())
        .put("severity",fields["third"].takeIf{it in listOf("Low","Medium","High","Critical")}?:"Medium")
        .put("mimeType",mime).put("fileName",fileName)
    val queue=OfflineQueue(context)
    val media=try{api.uploadMedia(bytes,mime,fileName,gps.latitude,gps.longitude,gps.accuracy.toDouble())}
    catch(e:java.io.IOException){
        if(e is ApiException)throw e
        val directory=File(context.filesDir,"offline-evidence").apply{mkdirs()}
        val evidence=File(directory,"$localId.$extension").apply{writeBytes(bytes)}
        queue.enqueue("DefectCreate",localId,payload.put("evidencePath",evidence.absolutePath))
        return
    }
    val address=runCatching{api.reverseGeocode(gps.latitude,gps.longitude)}.getOrDefault("${gps.latitude}, ${gps.longitude}")
    val body=JSONObject(payload.toString()).put("location",address).put("media",JSONArray().put(media.getString("id")))
    listOf("mimeType","fileName").forEach(body::remove)
    try{api.post("/api/defects",body)}catch(e:java.io.IOException){
        if(e is ApiException)throw e
        queue.enqueue("DefectCreate",localId,payload.put("location",address).put("mediaId",media.getString("id")))
    }
}

@Composable
private fun FieldMapScreen(vm:AppViewModel,api:ApiClient){
    val context=androidx.compose.ui.platform.LocalContext.current;val scope=rememberCoroutineScope();var selected by remember{mutableStateOf<MapPoint?>(null)};var address by remember{mutableStateOf("")};val location=remember{LocationController(context)}
    val permission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){grants->if(grants.values.any{it})scope.launch{location.current()?.let{selected=MapPoint(it.latitude,it.longitude,"Device GPS","Current location");address=api.reverseGeocode(it.latitude,it.longitude)}}}
    LaunchedEffect(Unit){vm.map(api)}
    Column(Modifier.fillMaxSize()){
        Box(Modifier.weight(1f).fillMaxWidth()){NativeMap(vm.mapData,selected,{point->selected=point;scope.launch{address=runCatching{api.reverseGeocode(point.lat,point.lng)}.getOrDefault("${point.lat}, ${point.lng}")}},Modifier.fillMaxSize())}
        Surface(tonalElevation=4.dp){Column(Modifier.padding(16.dp)){Text(selected?.title?:"Tap the map or use GPS",fontWeight=FontWeight.Bold);Text(address.ifBlank{selected?.let{"%.6f, %.6f".format(it.lat,it.lng)}?:"Projects, assets, GIS networks and defects"},style=MaterialTheme.typography.bodySmall,color=Color.Gray);Spacer(Modifier.height(8.dp));Button(onClick={permission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.MyLocation,null);Spacer(Modifier.width(8.dp));Text("Use current GPS")}}}
    }
}

@Composable
private fun SearchScreen(vm:AppViewModel,api:ApiClient){var q by remember{mutableStateOf("")};val scope=rememberCoroutineScope();Column(Modifier.fillMaxSize().padding(16.dp)){OutlinedTextField(q,{q=it;scope.launch{vm.search(api,it)}},modifier=Modifier.fillMaxWidth(),label={Text("Search all IIMM records")},leadingIcon={Icon(Icons.Outlined.Search,null)});Spacer(Modifier.height(12.dp));LazyColumn(verticalArrangement=Arrangement.spacedBy(8.dp)){items(vm.searchResults){r->ElevatedCard(Modifier.fillMaxWidth()){ListItem(headlineContent={Text(r.optString("title"),fontWeight=FontWeight.Bold)},supportingContent={Text(r.optString("subtitle"))},leadingContent={AssistChip(onClick={},label={Text(r.optString("type"))})})}}}}}

@Composable
private fun MoreScreen(vm:AppViewModel,api:ApiClient,logout:()->Unit){
    val scope=rememberCoroutineScope();val user=vm.session!!.user;val context=androidx.compose.ui.platform.LocalContext.current;val pendingOffline=remember{OfflineQueue(context).all().size}
    fun export(type:String){scope.launch{vm.action{val data=api.download("/api/reports/$type.csv");val name="iimm-$type-report.csv";if(Build.VERSION.SDK_INT>=29){val values=ContentValues().apply{put(MediaStore.Downloads.DISPLAY_NAME,name);put(MediaStore.Downloads.MIME_TYPE,"text/csv");put(MediaStore.Downloads.RELATIVE_PATH,"Download/IIMM")};val uri=context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values)?:error("Unable to create report file");context.contentResolver.openOutputStream(uri)?.use{it.write(data)}?:error("Unable to write report file")}else{context.getExternalFilesDir(null)?.resolve(name)?.writeBytes(data)};vm.error="$name was saved to Downloads/IIMM."}}}
    LazyColumn(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){item{ElevatedCard(Modifier.fillMaxWidth()){ListItem(headlineContent={Text(user.name,fontWeight=FontWeight.Bold)},supportingContent={Text("${user.designation} · ${user.role.label}\n${user.email}")},leadingContent={Icon(Icons.Outlined.AccountCircle,null,tint=Navy,modifier=Modifier.size(40.dp))})}};item{ElevatedCard(Modifier.fillMaxWidth()){ListItem(headlineContent={Text("$pendingOffline pending offline changes",fontWeight=FontWeight.Bold)},supportingContent={Text(if(pendingOffline==0)"All captured field work is synced." else "Saved evidence and field changes will retry automatically when connected.")},leadingContent={Icon(Icons.Outlined.Sync,null,tint=Navy)})}};if(user.role in setOf(Role.TENANT_ADMIN,Role.AUTHORITY,Role.CHECKER)){item{Text("CSV reports",fontWeight=FontWeight.Bold)};items(listOf("projects","assets","defects","payments","attendance")){type->OutlinedButton(onClick={export(type)},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.Download,null);Spacer(Modifier.width(8.dp));Text("Export ${type.replaceFirstChar(Char::uppercase)}")}}};item{OutlinedButton(onClick={scope.launch{api.post("/api/notifications/read-all")}},modifier=Modifier.fillMaxWidth()){Text("Mark all notifications read")}};item{OutlinedButton(onClick=logout,modifier=Modifier.fillMaxWidth(),colors=ButtonDefaults.outlinedButtonColors(contentColor=Color.Red)){Icon(Icons.Outlined.Logout,null);Spacer(Modifier.width(8.dp));Text("Sign out")}};item{Text("Native build 1.0.0\nAPI ${BuildConfig.API_BASE_URL}\nMappls credentials: ${if(BuildConfig.MAPPLS_CREDENTIALS_PRESENT)"installed" else "required"}",style=MaterialTheme.typography.bodySmall,color=Color.Gray)}}
}
