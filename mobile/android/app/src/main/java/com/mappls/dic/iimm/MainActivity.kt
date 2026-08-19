package com.mappls.dic.iimm

import android.Manifest
import android.net.Uri
import android.content.ContentValues
import android.os.Build
import android.provider.MediaStore
import android.provider.OpenableColumns
import android.os.Bundle
import androidx.core.content.FileProvider
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
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
import androidx.compose.ui.graphics.Brush
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
private val DeepNavy = Color(0xFF082E5A)
private val MapplsBlue = Color(0xFF1677C8)
private val Emerald = Color(0xFF188653)
private val Amber = Color(0xFFE89B28)
private val Sky = Color(0xFFEAF3FB)
private val Mist = Color(0xFFF4F7FA)
private val Ink = Color(0xFF152238)
private val Muted = Color(0xFF607089)

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme(
                colorScheme = lightColorScheme(
                    primary = Navy, onPrimary = Color.White,
                    secondary = Emerald, onSecondary = Color.White,
                    background = Mist, onBackground = Ink,
                    surface = Color.White, onSurface = Ink,
                    surfaceVariant = Sky, onSurfaceVariant = Muted,
                    outline = Color(0xFFD2DCE8), error = Color(0xFFB42318),
                ),
            ) { IimmApp() }
        }
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
    Box(Modifier.fillMaxSize().background(Brush.verticalGradient(listOf(DeepNavy, Navy, Mist), endY = 1150f))) {
        LazyColumn(
            modifier = Modifier.fillMaxSize().systemBarsPadding(),
            contentPadding = PaddingValues(horizontal = 22.dp, vertical = 24.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            item {
                Column(Modifier.padding(vertical = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        BrandMark()
                        Spacer(Modifier.width(14.dp))
                        Column {
                            Text("DIGITAL INDIA", color = Color(0xFFB9DCF7), style = MaterialTheme.typography.labelLarge, fontWeight = FontWeight.Bold)
                            Text("IIMM Platform", color = Color.White, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.Bold)
                        }
                    }
                    Spacer(Modifier.height(28.dp))
                    Text("Infrastructure work,\nconnected end to end.", color = Color.White, style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(10.dp))
                    Text("Field operations, governance approvals and citizen service in one secure workspace.", color = Color.White.copy(alpha = .82f), style = MaterialTheme.typography.bodyLarge)
                }
            }
            item {
                Column(Modifier.padding(top = 14.dp, bottom = 2.dp)) {
                    Text("Choose a demo workspace", style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.Bold)
                    Text("Role permissions are enforced by the API.", color = Muted, style = MaterialTheme.typography.bodySmall)
                }
            }
            items(vm.demoUsers,key={it.id}) { user ->
                ElevatedCard(
                    onClick={scope.launch { vm.login(api,user.id) }},
                    modifier=Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(18.dp),
                    colors = CardDefaults.elevatedCardColors(containerColor = Color.White),
                ) {
                    Row(Modifier.padding(16.dp),verticalAlignment=Alignment.CenterVertically){
                        Surface(color = roleColor(user.role).copy(alpha = .12f), shape = RoundedCornerShape(14.dp)) {
                            Icon(roleIcon(user.role),null,tint=roleColor(user.role), modifier = Modifier.padding(11.dp).size(24.dp))
                        }
                        Spacer(Modifier.width(13.dp))
                        Column(Modifier.weight(1f)){Text(user.name,fontWeight=FontWeight.Bold, style = MaterialTheme.typography.titleMedium);Text(user.role.label,color=Muted, style = MaterialTheme.typography.bodySmall)}
                        Icon(Icons.Outlined.ArrowForward,null, tint = Navy)
                    }
                }
            }
            item { Spacer(Modifier.height(16.dp)); Text("Prototype environment · Demo records", color = Muted, style = MaterialTheme.typography.labelSmall) }
        }
        if(vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter), color = Color(0xFF56C9F4))
    }
}

@Composable private fun BrandMark() { Surface(color=Color.White,shape=RoundedCornerShape(17.dp),modifier=Modifier.size(58.dp)){Box(contentAlignment=Alignment.Center){Text("DI",color=Navy,fontWeight=FontWeight.ExtraBold,style=MaterialTheme.typography.titleLarge)}} }
private fun roleColor(role: Role) = when(role){Role.TENANT_ADMIN->Color(0xFF7548B8);Role.AUTHORITY->Navy;Role.MAKER->Emerald;Role.CHECKER->Amber;Role.CITIZEN->MapplsBlue}
private fun roleIcon(role: Role) = when(role){Role.TENANT_ADMIN->Icons.Outlined.AdminPanelSettings;Role.AUTHORITY->Icons.Outlined.AccountBalance;Role.MAKER->Icons.Outlined.Engineering;Role.CHECKER->Icons.Outlined.VerifiedUser;Role.CITIZEN->Icons.Outlined.Campaign}

private enum class Tab { HOME, MODULES, MAP, SEARCH, MORE }

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainShell(vm: AppViewModel, api: ApiClient, logout:()->Unit) {
    var tab by remember { mutableStateOf(Tab.HOME) }
    var module by remember { mutableStateOf<ModuleSpec?>(null) }
    val user=vm.session!!.user
    Scaffold(
        containerColor = Mist,
        topBar={TopAppBar(title={Column{Text(module?.title ?: "IIMM Platform",fontWeight=FontWeight.Bold);Text(user.role.label.uppercase(),style=MaterialTheme.typography.labelSmall,color=Color.White.copy(alpha=.72f))}},navigationIcon={if(module!=null){IconButton(onClick={module=null}){Icon(Icons.Outlined.ArrowBack,"Back", tint = Color.White)}}},colors=TopAppBarDefaults.topAppBarColors(containerColor=DeepNavy,titleContentColor=Color.White))},
        bottomBar={if(module==null) NavigationBar(containerColor=Color.White,tonalElevation=10.dp) { listOf(Tab.HOME to Icons.Outlined.Home,Tab.MODULES to Icons.Outlined.Apps,Tab.MAP to Icons.Outlined.Map,Tab.SEARCH to Icons.Outlined.Search,Tab.MORE to Icons.Outlined.MoreHoriz).forEach{(item,icon)->NavigationBarItem(selected=tab==item,onClick={tab=item},icon={Icon(icon,item.name)},label={Text(item.name.lowercase().replaceFirstChar(Char::uppercase))},colors=NavigationBarItemDefaults.colors(selectedIconColor=Navy,selectedTextColor=Navy,indicatorColor=Sky,unselectedIconColor=Muted,unselectedTextColor=Muted))} }},
    ) { padding -> Box(Modifier.padding(padding).fillMaxSize()) {
        if(module!=null) ModuleScreen(vm,api,module!!)
        else when(tab){Tab.HOME->HomeScreen(vm,api){module=it};Tab.MODULES->ModulesScreen(user.role){module=it};Tab.MAP->FieldMapScreen(vm,api);Tab.SEARCH->SearchScreen(vm,api);Tab.MORE->MoreScreen(vm,api,logout)}
        if(vm.busy) LinearProgressIndicator(Modifier.fillMaxWidth().align(Alignment.TopCenter))
    } }
}

@Composable
private fun HomeScreen(vm:AppViewModel,api:ApiClient,open:(ModuleSpec)->Unit){
    val scope=rememberCoroutineScope();LaunchedEffect(Unit){vm.dashboard(api)};val data=vm.dashboard
    LazyColumn(Modifier.fillMaxSize().background(Mist),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(14.dp)){
        item{DashboardHero(vm.session!!.user,vm.session!!.tenantName)}
        val kpis=data?.optJSONArray("kpis")?.let(::jsonObjects).orEmpty();items(kpis.chunked(2)){row->Row(horizontalArrangement=Arrangement.spacedBy(12.dp)){row.forEachIndexed{index,item->ElevatedCard(Modifier.weight(1f),shape=RoundedCornerShape(18.dp),colors=CardDefaults.elevatedCardColors(containerColor=if(index%2==0)Color.White else Sky)){Column(Modifier.padding(17.dp)){Icon(if(index%2==0)Icons.Outlined.QueryStats else Icons.Outlined.TaskAlt,null,tint=if(index%2==0)Navy else Emerald,modifier=Modifier.size(22.dp));Spacer(Modifier.height(8.dp));Text(item.optString("value"),style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold,color=Ink);Text(item.optString("label"),style=MaterialTheme.typography.bodySmall,color=Muted)}}};if(row.size==1)Spacer(Modifier.weight(1f))}}
        item{SectionHeading("Priority work","Your most relevant operational areas")}
        items(MODULES.filter{vm.session!!.user.role in it.roles}.take(5)){spec->ModuleActionCard(spec,open)}
        item{OutlinedButton(onClick={scope.launch{vm.dashboard(api)}},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.Refresh,null);Spacer(Modifier.width(8.dp));Text("Refresh dashboard")}}
    }
}

@Composable private fun DashboardHero(user:User,tenantName:String?){
    Surface(shape=RoundedCornerShape(24.dp),color=Color.Transparent,modifier=Modifier.fillMaxWidth()){
        Column(Modifier.background(Brush.linearGradient(listOf(DeepNavy,Navy,MapplsBlue))).padding(20.dp)){
            Row(verticalAlignment=Alignment.CenterVertically){Surface(color=Color.White.copy(alpha=.14f),shape=RoundedCornerShape(50.dp)){Icon(roleIcon(user.role),null,tint=Color.White,modifier=Modifier.padding(10.dp).size(22.dp))};Spacer(Modifier.width(10.dp));Text(user.role.label.uppercase(),color=Color.White.copy(alpha=.8f),style=MaterialTheme.typography.labelMedium,fontWeight=FontWeight.Bold)}
            Spacer(Modifier.height(24.dp));Text("Good day, ${user.name.substringBefore(' ')}",style=MaterialTheme.typography.headlineMedium,fontWeight=FontWeight.Bold,color=Color.White);Spacer(Modifier.height(4.dp));Text(tenantName ?: "Integrated infrastructure operations",color=Color.White.copy(alpha=.78f),style=MaterialTheme.typography.bodyMedium)
        }
    }
}
@Composable private fun SectionHeading(title:String,subtitle:String){Column{Text(title,style=MaterialTheme.typography.titleLarge,fontWeight=FontWeight.Bold,color=Ink);Text(subtitle,style=MaterialTheme.typography.bodySmall,color=Muted)}}
@Composable private fun ModuleActionCard(spec:ModuleSpec,open:(ModuleSpec)->Unit){ElevatedCard(onClick={open(spec)},modifier=Modifier.fillMaxWidth(),shape=RoundedCornerShape(18.dp),colors=CardDefaults.elevatedCardColors(containerColor=Color.White)){Row(Modifier.padding(16.dp),verticalAlignment=Alignment.CenterVertically){Surface(color=Sky,shape=RoundedCornerShape(14.dp)){Icon(moduleIcon(spec.key),null,tint=Navy,modifier=Modifier.padding(11.dp).size(24.dp))};Spacer(Modifier.width(14.dp));Column(Modifier.weight(1f)){Text(spec.title,fontWeight=FontWeight.Bold,style=MaterialTheme.typography.titleMedium);Text(spec.subtitle,style=MaterialTheme.typography.bodySmall,color=Muted)};Icon(Icons.Outlined.ArrowForward,null,tint=Navy)}}}

@Composable
private fun ModulesScreen(role:Role,open:(ModuleSpec)->Unit){LazyColumn(Modifier.fillMaxSize().background(Mist),contentPadding=PaddingValues(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){item{Surface(color=Sky,shape=RoundedCornerShape(20.dp),modifier=Modifier.fillMaxWidth()){Column(Modifier.padding(18.dp)){Text("All capabilities",style=MaterialTheme.typography.headlineSmall,fontWeight=FontWeight.Bold);Text("Actions are enforced by role and tenant on the server.",color=Muted)}}};items(MODULES.filter{role in it.roles}){spec->ModuleActionCard(spec,open)};item{Spacer(Modifier.height(12.dp))}}}

private fun moduleIcon(key:String)=when(key){"projects"->Icons.Outlined.AccountTree;"assets"->Icons.Outlined.Inventory2;"gis"->Icons.Outlined.Layers;"attendance"->Icons.Outlined.MyLocation;"inspections"->Icons.Outlined.FactCheck;"defects"->Icons.Outlined.Build;"payments"->Icons.Outlined.Payments;"tickets"->Icons.Outlined.SupportAgent;"notifications"->Icons.Outlined.Notifications;"sync"->Icons.Outlined.Sync;else->Icons.Outlined.ListAlt}

@Composable
private fun ModuleScreen(vm:AppViewModel,api:ApiClient,spec:ModuleSpec){
    val scope=rememberCoroutineScope();var dialog by remember{mutableStateOf(false)};var atrRecord by remember{mutableStateOf<JSONObject?>(null)};var pendingAtr by remember{mutableStateOf<JSONObject?>(null)};var inspectionRecord by remember{mutableStateOf<JSONObject?>(null)};var ticketRecord by remember{mutableStateOf<JSONObject?>(null)};var detailRecord by remember{mutableStateOf<JSONObject?>(null)};var manageRecord by remember{mutableStateOf<JSONObject?>(null)};var validationRecord by remember{mutableStateOf<JSONObject?>(null)};var feedbackRecord by remember{mutableStateOf<JSONObject?>(null)};var reviewRecord by remember{mutableStateOf<JSONObject?>(null)};var reviewKind by remember{mutableStateOf("")};var parsedGis by remember{mutableStateOf<JSONObject?>(null)};var gisFileName by remember{mutableStateOf("")};val context=androidx.compose.ui.platform.LocalContext.current;val location=remember{LocationController(context)};val queue=remember{OfflineQueue(context)}
    val attendancePermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){grants->if(grants.values.any{it})scope.launch{vm.action{val sessions=SessionStore(context);val projectId=runCatching{jsonObjects(api.array("/api/projects")).firstOrNull()?.getString("id")}.getOrNull()?:sessions.projectId()?:error("Connect once to cache an assigned project before marking attendance offline.");sessions.saveProjectId(projectId);val gps=location.current()?:error("Current GPS could not be acquired.");val body=JSONObject().put("projectId",projectId).put("lat",gps.latitude).put("lng",gps.longitude).put("accuracyMeters",gps.accuracy.toDouble()).put("offline",false);try{api.post("/api/attendance",body)}catch(e:java.io.IOException){if(e is ApiException)throw e;queue.enqueue("Attendance","local-att-${System.currentTimeMillis()}",body.put("offline",true))};runCatching{vm.module(api,spec)}}}}
    val evidenceLocationPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){grants->if(grants.values.any{it})dialog=true else vm.error="Location access is required for geo-tagged evidence."}
    val atrLocationPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){grants->if(grants.values.any{it})atrRecord=pendingAtr else vm.error="Location access is required for a geo-tagged ATR."}
    val gisPicker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){uri->if(uri!=null)scope.launch{vm.action{
        val name=context.contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{cursor->if(cursor.moveToFirst())cursor.getString(0)else null}?:"network.kml"
        val bytes=context.contentResolver.openInputStream(uri)?.use{it.readBytes()}?:error("The selected GIS file could not be read.")
        parsedGis=api.parseGisFile(bytes,name);gisFileName=name
    }}}
    LaunchedEffect(spec.key){vm.module(api,spec)}
    Scaffold(floatingActionButton={if(spec.createKind!=null&&canCreate(vm.session!!.user.role,spec.key))FloatingActionButton(onClick={when(spec.key){"attendance"->attendancePermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION));"defects"->evidenceLocationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION));"gis_imports"->gisPicker.launch(arrayOf("application/vnd.google-earth.kml+xml","application/vnd.google-earth.kmz","application/zip","application/octet-stream","*/*"));else->dialog=true}}){Icon(if(spec.key=="attendance")Icons.Outlined.MyLocation else if(spec.key=="gis_imports")Icons.Outlined.UploadFile else Icons.Outlined.Add,"Create")}}){padding->
        LazyColumn(Modifier.padding(padding).fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
            item{Text(spec.subtitle,color=Color.Gray);Spacer(Modifier.height(4.dp));Text("${vm.records.size} records",style=MaterialTheme.typography.labelLarge,color=Navy)}
            if(spec.key=="tickets")item{SelfServiceFaq()}
            if(vm.records.isEmpty()&&!vm.busy)item{EmptyState("No records are visible for this role and tenant.")}
            items(vm.records,key={it.optString("id",it.toString().hashCode().toString())}){record->RecordCard(record,spec.key,vm.session!!.user.role,onOpen={detailRecord=record}){path,body->when(path){
                "local:atr"->{pendingAtr=record;atrLocationPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))}
                "local:inspection"->inspectionRecord=record
                "local:ticket"->ticketRecord=record
                "local:manage"->manageRecord=record
                "local:defect-validation"->validationRecord=record
                "local:feedback"->feedbackRecord=record
                "local:payment-review","local:atr-review"->{reviewRecord=record;reviewKind=path}
                else->scope.launch{vm.action{applyRecordAction(record,spec,path,body,vm,api,queue)}}
            }}}
            item{Spacer(Modifier.height(80.dp))}
        }
    }
    if(dialog)CreateDialog(spec.key,vm,api,onDismiss={dialog=false}){scope.launch{vm.action{createRecord(spec.key,it,vm,api);vm.module(api,spec);dialog=false}}}
    atrRecord?.let{record->AtrDialog(onDismiss={atrRecord=null}){summary,uri->scope.launch{vm.action{submitAtr(record,summary,uri,api,context,queue);runCatching{vm.module(api,spec)};atrRecord=null}}}}
    inspectionRecord?.let{record->InspectionDialog(record,vm.session!!.user.role,onDismiss={inspectionRecord=null}){body->scope.launch{vm.action{applyRecordAction(record,spec,"/api/inspections/${record.getString("id")}",body,vm,api,queue);inspectionRecord=null}}}}
    ticketRecord?.let{record->TicketDialog(record,vm.session!!.user,onDismiss={ticketRecord=null}){body->scope.launch{vm.action{applyRecordAction(record,spec,"/api/tickets/${record.getString("id")}",body,vm,api,queue);ticketRecord=null}}}}
    detailRecord?.let{record->RecordDetailDialog(record,spec.key,onDismiss={detailRecord=null})}
    manageRecord?.let{record->ManageRecordDialog(record,spec.key,onDismiss={manageRecord=null}){body->scope.launch{vm.action{api.patch("/api/${spec.key}/${record.getString("id")}",body);vm.module(api,spec);manageRecord=null}}}}
    validationRecord?.let{record->DefectValidationDialog(api,onDismiss={validationRecord=null}){body->scope.launch{vm.action{api.post("/api/defects/${record.getString("id")}/validate",body);vm.module(api,spec);validationRecord=null}}}}
    feedbackRecord?.let{record->FeedbackDialog(onDismiss={feedbackRecord=null}){body->scope.launch{vm.action{api.post("/api/defects/${record.getString("id")}/feedback",body);vm.module(api,spec);feedbackRecord=null}}}}
    reviewRecord?.let{record->DecisionDialog(if(reviewKind=="local:atr-review")"Review Action Taken Report" else "Review payment claim",onDismiss={reviewRecord=null}){approve,note->scope.launch{vm.action{val path=if(reviewKind=="local:atr-review")"/api/defects/${record.getString("id")}/verify-atr" else "/api/payments/${record.getString("id")}/action";api.post(path,JSONObject().put("decision",if(reviewKind=="local:atr-review"){if(approve)"verify" else "rework"}else{if(approve)"approve" else "reject"}).put("note",note));vm.module(api,spec);reviewRecord=null}}}}
    parsedGis?.let{parsed->GisImportDialog(parsed,gisFileName,api,onDismiss={parsedGis=null}){body->scope.launch{vm.action{api.post("/api/gis/imports",body);vm.module(api,spec);parsedGis=null}}}}
}

private val helpdeskFaq = listOf(
    "How does offline sync work?" to "Field actions are stored locally when connectivity is poor. On reconnect, the server timestamp wins; conflicting local edits remain in a manual-review queue instead of being silently dropped.",
    "Why was my report linked as a duplicate?" to "Nearby open reports on the same asset are linked to one official defect. Your report still counts, raises visibility and may escalate severity.",
    "Who verifies my Action Taken Report?" to "The assigned Checker reviews your evidence and work outcome. A defect becomes resolved only after that independent verification.",
)

@Composable
private fun SelfServiceFaq(){
    var expanded by remember{mutableIntStateOf(0)}
    ElevatedCard(Modifier.fillMaxWidth()){
        Column(Modifier.padding(14.dp),verticalArrangement=Arrangement.spacedBy(6.dp)){
            Text("Self-serve help",style=MaterialTheme.typography.titleMedium,fontWeight=FontWeight.Bold,color=Navy)
            helpdeskFaq.forEachIndexed{index,(question,answer)->
                TextButton(onClick={expanded=index},modifier=Modifier.fillMaxWidth()){
                    Column(Modifier.fillMaxWidth()){
                        Text(question,fontWeight=FontWeight.SemiBold)
                        if(expanded==index)Text(answer,style=MaterialTheme.typography.bodySmall,color=Color.Gray,modifier=Modifier.padding(top=4.dp))
                    }
                }
            }
        }
    }
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

private fun canCreate(role:Role,key:String)=when(key){"tenants"->role==Role.TENANT_ADMIN;"users","projects","assets"->role in setOf(Role.TENANT_ADMIN,Role.AUTHORITY);"gis_imports"->role==Role.AUTHORITY;"attendance","payments"->role==Role.MAKER;"inspections"->role in setOf(Role.AUTHORITY,Role.MAKER,Role.CHECKER);"defects","tickets"->true;else->false}

@Composable
private fun RecordCard(record:JSONObject,key:String,role:Role,onOpen:()->Unit,action:(String,JSONObject)->Unit){ElevatedCard(onClick=onOpen,modifier=Modifier.fillMaxWidth()){Column(Modifier.padding(16.dp)){Row(verticalAlignment=Alignment.CenterVertically){Column(Modifier.weight(1f)){Text(record.displayTitle(),fontWeight=FontWeight.Bold);record.displaySubtitle().takeIf(String::isNotBlank)?.let{Text(it,color=Color.Gray,style=MaterialTheme.typography.bodySmall)}};record.optString("status").takeIf(String::isNotBlank)?.let{Surface(color=Sky,shape=RoundedCornerShape(40.dp)){Text(it,style=MaterialTheme.typography.labelMedium,color=Navy,modifier=Modifier.padding(horizontal=10.dp,vertical=7.dp))}}};val buttons=workflowButtons(record,key,role);if(buttons.isNotEmpty()){Spacer(Modifier.height(10.dp));Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){buttons.take(2).forEach{button->OutlinedButton(onClick={action(button.path,button.body)}){Text(button.label)}}}};Text("Tap for full record",style=MaterialTheme.typography.labelSmall,color=Navy,modifier=Modifier.padding(top=8.dp))}}}
private data class WorkflowButton(val label:String,val path:String,val body:JSONObject)
private fun workflowButtons(r:JSONObject,key:String,role:Role):List<WorkflowButton>{val id=r.optString("id");return when{
    key=="notifications"&&!r.optBoolean("read")->listOf(WorkflowButton("Mark read","/api/notifications/$id/read",JSONObject()))
    key=="defects"&&role==Role.CHECKER&&r.optString("checkerValidation")=="Pending"->listOf(WorkflowButton("Review & assign","local:defect-validation",JSONObject()))
    key=="defects"&&role==Role.MAKER&&r.optString("status") in setOf("Assigned","Reopened")->listOf(WorkflowButton("Start work","/api/defects/$id/start",JSONObject().put("status","In Progress")))
    key=="defects"&&role==Role.MAKER&&r.optString("status")=="In Progress"->listOf(WorkflowButton("Submit ATR","local:atr",JSONObject()))
    key=="defects"&&role==Role.CHECKER&&r.optString("status")=="ATR Submitted"->listOf(WorkflowButton("Review ATR","local:atr-review",JSONObject()))
    key=="defects"&&role==Role.CITIZEN&&r.optString("status") in setOf("Resolved","Closed")->listOf(WorkflowButton("Rate resolution","local:feedback",JSONObject()))
    key=="inspections"->listOf(WorkflowButton("Open checklist","local:inspection",JSONObject()))
    key=="tickets"->listOf(WorkflowButton("View & respond","local:ticket",JSONObject()))
    key=="tenants"&&role==Role.TENANT_ADMIN->listOf(WorkflowButton(if(r.optString("status")=="Live")"Deactivate" else "Set live","/api/tenants/$id",JSONObject().put("status",if(r.optString("status")=="Live")"Inactive" else "Live")),WorkflowButton("Configure","local:manage",JSONObject()))
    key=="users"&&role in setOf(Role.TENANT_ADMIN,Role.AUTHORITY)&&r.optString("role") !in setOf("tenant_admin","citizen")->listOf(WorkflowButton(if(r.optBoolean("active",true))"Deactivate" else "Activate","/api/users/$id",JSONObject().put("active",!r.optBoolean("active",true))),WorkflowButton("Edit access","local:manage",JSONObject()))
    key=="projects"&&role==Role.AUTHORITY->{val next=(r.optInt("progress",0)+10).coerceAtMost(100);listOf(WorkflowButton(if(next==100)"Complete" else "Advance to $next%","/api/projects/$id",JSONObject().put("progress",next).put("status",if(next==100)"Completed" else "Active")),WorkflowButton("Manage","local:manage",JSONObject()))}
    key=="assets"&&role==Role.AUTHORITY->listOf(WorkflowButton(if(r.optString("condition")=="Attention")"Mark good" else "Needs attention","/api/assets/$id",JSONObject().put("condition",if(r.optString("condition")=="Attention")"Good" else "Attention")),WorkflowButton("Manage","local:manage",JSONObject()))
    key=="gis_imports"&&role==Role.AUTHORITY&&r.optString("status")=="Published"->listOf(WorkflowButton("Rollback import","/api/gis/imports/$id/rollback",JSONObject()))
    key=="payments"&&role==Role.CHECKER&&r.optString("status")=="Submitted"->listOf(WorkflowButton("Review claim","local:payment-review",JSONObject()))
    key=="payments"&&role==Role.AUTHORITY&&r.optString("status")=="Checker Verified"->listOf(WorkflowButton("Authorise claim","local:payment-review",JSONObject()))
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
            record.optJSONArray("defectIds")?.let{array->if(array.length()>0)Text("Raised in Defect Management: ${(0 until array.length()).joinToString(", "){array.optString(it)}}",color=Color(0xFF9A5A00),style=MaterialTheme.typography.bodySmall)}
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

@Composable
private fun DefectValidationDialog(api:ApiClient,onDismiss:()->Unit,onSubmit:(JSONObject)->Unit){
    var users by remember{mutableStateOf<List<JSONObject>>(emptyList())};var projects by remember{mutableStateOf<List<JSONObject>>(emptyList())};var makerId by remember{mutableStateOf("")};var projectId by remember{mutableStateOf("")};var approve by remember{mutableStateOf(true)}
    LaunchedEffect(Unit){runCatching{users=jsonObjects(api.array("/api/users"));projects=jsonObjects(api.array("/api/projects"));makerId=users.firstOrNull{it.optString("role")=="maker"&&it.optBoolean("active",true)}?.optString("id").orEmpty();projectId=projects.firstOrNull()?.optString("id").orEmpty()}}
    AlertDialog(onDismissRequest=onDismiss,title={Text("Validate citizen issue")},text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){ChoiceField("Decision",if(approve)"approve" else "reject",listOf("approve" to "Approve and assign","reject" to "Reject report")){approve=it=="approve"};if(approve){ChoiceField("Assigned Maker",makerId,users.filter{it.optString("role")=="maker"&&it.optBoolean("active",true)}.map{it.optString("id") to it.optString("name")}){makerId=it};ChoiceField("Project",projectId,projects.map{it.optString("id") to "${it.optString("code")} · ${it.optString("name")}"}){projectId=it}};Text("Approval links the report to the chosen project and Maker; rejection closes it as invalid.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)}},confirmButton={Button(enabled=!approve||(makerId.isNotBlank()&&projectId.isNotBlank()),onClick={onSubmit(JSONObject().put("decision",if(approve)"approve" else "reject").apply{if(approve){put("makerId",makerId);put("projectId",projectId)}})}){Text("Submit decision")}},dismissButton={TextButton(onClick=onDismiss){Text("Cancel")}})
}

@Composable
private fun FeedbackDialog(onDismiss:()->Unit,onSubmit:(JSONObject)->Unit){
    var rating by remember{mutableFloatStateOf(5f)};var comment by remember{mutableStateOf("")};var reopen by remember{mutableStateOf(false)}
    AlertDialog(onDismissRequest=onDismiss,title={Text("Rate issue resolution")},text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){Text("${rating.toInt()} out of 5 stars",fontWeight=FontWeight.Bold,color=Navy);Slider(rating,{rating=it},valueRange=1f..5f,steps=3);OutlinedTextField(comment,{comment=it},label={Text("Comments")},minLines=3,modifier=Modifier.fillMaxWidth());Row(verticalAlignment=Alignment.CenterVertically){Switch(reopen,{reopen=it});Spacer(Modifier.width(8.dp));Text("Reopen because work is incomplete")}}},confirmButton={Button(onClick={onSubmit(JSONObject().put("rating",rating.toInt()).put("comment",comment).put("reopen",reopen))}){Text(if(reopen)"Submit and reopen" else "Close report")}},dismissButton={TextButton(onClick=onDismiss){Text("Cancel")}})
}

@Composable
private fun DecisionDialog(title:String,onDismiss:()->Unit,onSubmit:(Boolean,String)->Unit){
    var approve by remember{mutableStateOf(true)};var note by remember{mutableStateOf("")}
    AlertDialog(onDismissRequest=onDismiss,title={Text(title)},text={Column(verticalArrangement=Arrangement.spacedBy(10.dp)){ChoiceField("Decision",if(approve)"approve" else "reject",listOf("approve" to "Approve / verify","reject" to "Reject / return for rework")){approve=it=="approve"};OutlinedTextField(note,{note=it},label={Text("Review note")},minLines=3,modifier=Modifier.fillMaxWidth());Text("Your decision and note are added to the auditable record.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)}},confirmButton={Button(enabled=note.trim().length>=3,onClick={onSubmit(approve,note.trim())}){Text("Submit review")}},dismissButton={TextButton(onClick=onDismiss){Text("Cancel")}})
}

@Composable
private fun ManageRecordDialog(record:JSONObject,key:String,onDismiss:()->Unit,onSave:(JSONObject)->Unit){
    fun strings(name:String)=record.optJSONArray(name)?.let{array->(0 until array.length()).map{array.optString(it)}}.orEmpty()
    var name by remember{mutableStateOf(record.optString("name"))};var location by remember{mutableStateOf(record.optString("location"))};var status by remember{mutableStateOf(record.optString("status"))};var condition by remember{mutableStateOf(record.optString("condition","Good"))};var role by remember{mutableStateOf(record.optString("role","maker"))};var designation by remember{mutableStateOf(record.optString("designation"))};var active by remember{mutableStateOf(record.optBoolean("active",true))};var progress by remember{mutableStateOf(record.optInt("progress",0).toString())};var radius by remember{mutableStateOf(record.optInt("geofenceRadiusMeters",250).toString())};var hierarchy by remember{mutableStateOf(record.optString("hierarchy"))};var modulesText by remember{mutableStateOf(strings("modules").joinToString(", "))};var makers by remember{mutableStateOf(strings("makerIds").joinToString(", "))};var checkers by remember{mutableStateOf(strings("checkerIds").joinToString(", "))}
    var slas by remember{mutableStateOf(record.optJSONObject("slas")?.let{"${it.optInt("Critical",24)},${it.optInt("High",72)},${it.optInt("Medium",168)},${it.optInt("Low",360)}"}?:"24,72,168,360")}
    val initialPoint=remember(record,key){if(key=="projects")record.optJSONObject("center")?.let{it.optDouble("lat") to it.optDouble("lng")}else record.optJSONObject("geometry")?.takeIf{it.optString("type")=="Point"}?.optJSONArray("coordinates")?.let{it.optDouble(1) to it.optDouble(0)}};var lat by remember{mutableStateOf(initialPoint?.first?.toString().orEmpty())};var lng by remember{mutableStateOf(initialPoint?.second?.toString().orEmpty())}
    var assetTypesText by remember{mutableStateOf(record.optJSONArray("assetTypes")?.let{array->(0 until array.length()).mapNotNull{array.optJSONObject(it)}.joinToString("\n"){item->"${item.optString("name")} | ${item.optJSONArray("attributes")?.let{a->(0 until a.length()).joinToString(", "){a.optString(it)}}.orEmpty()} | ${item.optJSONArray("checklist")?.let{a->(0 until a.length()).joinToString(", "){a.optString(it)}}.orEmpty()}"}}.orEmpty())}
    var milestones by remember{mutableStateOf(record.optJSONArray("milestones")?.let{array->(0 until array.length()).mapNotNull{array.optJSONObject(it)}.joinToString("\n"){item->"${if(item.optBoolean("done"))"✓" else "○"} ${item.optString("name")} | ${item.optString("due")}"}}.orEmpty())}
    var documents by remember{mutableStateOf(record.optJSONArray("documents")?.let{array->(0 until array.length()).mapNotNull{array.optJSONObject(it)}.joinToString("\n"){it.optString("name")}}.orEmpty())}
    var attributes by remember{mutableStateOf(record.optJSONObject("attributes")?.let{obj->obj.keys().asSequence().joinToString("\n"){field->"$field=${obj.optString(field)}"}}.orEmpty())}
    fun csv(value:String)=JSONArray(value.split(',').map{it.trim()}.filter{it.isNotBlank()})
    fun body():JSONObject=when(key){
        "tenants"->{val hours=slas.split(',').mapNotNull{it.trim().toIntOrNull()};val existing=record.optJSONArray("assetTypes")?.let{array->(0 until array.length()).mapNotNull{array.optJSONObject(it)}}.orEmpty();val types=JSONArray();assetTypesText.lineSequence().filter{it.isNotBlank()}.forEachIndexed{index,line->val parts=line.split('|',limit=3).map{it.trim()};types.put(JSONObject().put("id",existing.getOrNull(index)?.optString("id")?:"at-native-${System.currentTimeMillis()}-$index").put("name",parts[0]).put("attributes",JSONArray(parts.getOrNull(1).orEmpty().split(',').map{it.trim()}.filter{it.isNotBlank()})).put("checklist",JSONArray(parts.getOrNull(2).orEmpty().split(',').map{it.trim()}.filter{it.isNotBlank()})))};JSONObject().put("name",name).put("hierarchy",hierarchy).put("modules",csv(modulesText)).put("assetTypes",types).put("slas",JSONObject().put("Critical",hours.getOrNull(0)?:24).put("High",hours.getOrNull(1)?:72).put("Medium",hours.getOrNull(2)?:168).put("Low",hours.getOrNull(3)?:360)).put("status",status)}
        "users"->JSONObject().put("role",role).put("designation",designation).put("active",active)
        "projects"->{val milestoneJson=JSONArray();milestones.lineSequence().filter{it.isNotBlank()}.forEach{line->val parts=line.removePrefix("✓").removePrefix("○").trim().split('|',limit=2);milestoneJson.put(JSONObject().put("name",parts[0].trim()).put("due",parts.getOrNull(1)?.trim().orEmpty().ifBlank{"TBD"}).put("done",line.trim().startsWith("✓")))};val existing=record.optJSONArray("documents")?.let{array->(0 until array.length()).mapNotNull{array.optJSONObject(it)}}.orEmpty();val docs=JSONArray();documents.lineSequence().filter{it.isNotBlank()}.forEachIndexed{index,title->docs.put(JSONObject().put("id",existing.getOrNull(index)?.optString("id")?:"doc-${System.currentTimeMillis()}-$index").put("name",title.trim()).put("category",existing.getOrNull(index)?.optString("category")?:"Project document").put("uploadedAt",existing.getOrNull(index)?.optString("uploadedAt")?:Instant.now().toString()))};JSONObject().put("name",name).put("location",location).put("status",status).put("progress",progress.toIntOrNull()?:0).put("center",JSONObject().put("lat",lat.toDoubleOrNull()?:record.optJSONObject("center")?.optDouble("lat")?:28.6139).put("lng",lng.toDoubleOrNull()?:record.optJSONObject("center")?.optDouble("lng")?:77.2090)).put("geofenceRadiusMeters",radius.toIntOrNull()?:250).put("makerIds",csv(makers)).put("checkerIds",csv(checkers)).put("milestones",milestoneJson).put("documents",docs)}
        "assets"->{val attrs=JSONObject();attributes.lineSequence().map{it.split('=',limit=2)}.filter{it.size==2}.forEach{attrs.put(it[0].trim(),it[1].trim())};JSONObject().put("name",name).put("location",location).put("condition",condition).put("attributes",attrs).apply{if(lat.toDoubleOrNull()!=null&&lng.toDoubleOrNull()!=null)put("geometry",JSONObject().put("type","Point").put("coordinates",JSONArray().put(lng.toDouble()).put(lat.toDouble())))}}
        else->JSONObject()
    }
    AlertDialog(onDismissRequest=onDismiss,title={Text("Manage ${record.displayTitle()}")},text={LazyColumn(Modifier.heightIn(max=560.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
        if(key in setOf("tenants","projects","assets"))item{OutlinedTextField(name,{name=it},label={Text("Name")},modifier=Modifier.fillMaxWidth())}
        if(key=="tenants"){item{ChoiceField("Status",status,listOf("Live","Provisioning","Requested","Inactive").map{it to it}){status=it}};item{OutlinedTextField(hierarchy,{hierarchy=it},label={Text("Hierarchy")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(modulesText,{modulesText=it},label={Text("Modules · comma separated")},minLines=2,modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(assetTypesText,{assetTypesText=it},label={Text("Asset types · Name | attrs | checklist")},minLines=5,modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(slas,{slas=it},label={Text("SLA hours · Critical, High, Medium, Low")},modifier=Modifier.fillMaxWidth())}}
        if(key=="users"){item{ChoiceField("Role",role,listOf("authority" to "Authority","maker" to "Maker","checker" to "Checker")){role=it}};item{OutlinedTextField(designation,{designation=it},label={Text("Designation")},modifier=Modifier.fillMaxWidth())};item{Row(verticalAlignment=Alignment.CenterVertically){Switch(active,{active=it});Spacer(Modifier.width(8.dp));Text(if(active)"Active access" else "Inactive access")}}}
        if(key=="projects"){item{NativeMap(MapData(emptyList(),emptyList(),emptyList()),lat.toDoubleOrNull()?.let{la->lng.toDoubleOrNull()?.let{lo->MapPoint(la,lo,"Project centre","Selection")}},onSelect={point->lat=point.lat.toString();lng=point.lng.toString()},modifier=Modifier.fillMaxWidth().height(220.dp))};item{OutlinedTextField(location,{location=it},label={Text("Location")},modifier=Modifier.fillMaxWidth())};item{ChoiceField("Status",status,listOf("Active","Pending","In Review","Overdue","Completed").map{it to it}){status=it}};item{OutlinedTextField(progress,{progress=it},label={Text("Progress · 0–100")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(radius,{radius=it},label={Text("Geofence radius · metres")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(makers,{makers=it},label={Text("Maker IDs · comma separated")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(checkers,{checkers=it},label={Text("Checker IDs · comma separated")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(milestones,{milestones=it},label={Text("Milestones · ✓/○ name | due")},minLines=4,modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(documents,{documents=it},label={Text("Project documents · one name per line")},minLines=4,modifier=Modifier.fillMaxWidth())}}
        if(key=="assets"){item{NativeMap(MapData(emptyList(),emptyList(),emptyList()),lat.toDoubleOrNull()?.let{la->lng.toDoubleOrNull()?.let{lo->MapPoint(la,lo,"Asset location","Selection")}},onSelect={point->lat=point.lat.toString();lng=point.lng.toString()},modifier=Modifier.fillMaxWidth().height(220.dp))};item{ChoiceField("Condition",condition,listOf("Good","Fair","Attention","Critical").map{it to it}){condition=it}};item{OutlinedTextField(location,{location=it},label={Text("Location")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(attributes,{attributes=it},label={Text("Attributes · one key=value per line")},minLines=5,modifier=Modifier.fillMaxWidth())}}
    }},confirmButton={Button(onClick={onSave(body())}){Text("Save")}},dismissButton={TextButton(onClick=onDismiss){Text("Cancel")}})
}

@Composable
private fun RecordDetailDialog(record:JSONObject,key:String,onDismiss:()->Unit){
    fun rows(value:Any?,prefix:String=""):List<Pair<String,String>> = when(value){
        is JSONObject->value.keys().asSequence().flatMap{field->rows(value.opt(field),if(prefix.isBlank())field else "$prefix · $field").asSequence()}.toList()
        is JSONArray->if(value.length()==0)listOf(prefix to "None")else (0 until value.length()).flatMap{index->rows(value.opt(index),"$prefix ${index+1}")}
        JSONObject.NULL,null->listOf(prefix to "Not set")
        else->listOf(prefix to value.toString())
    }
    val important=remember(record){rows(record).filterNot{(name,_)->name in setOf("tenantId","featureCollection")}.take(80)}
    AlertDialog(onDismissRequest=onDismiss,title={Text(record.displayTitle())},text={LazyColumn(Modifier.heightIn(max=520.dp),verticalArrangement=Arrangement.spacedBy(9.dp)){
        item{Text("${key.replace('_',' ').replaceFirstChar(Char::uppercase)} record",color=Navy,fontWeight=FontWeight.Bold)}
        items(important){(label,value)->Column{Text(label.replaceFirstChar(Char::uppercase),style=MaterialTheme.typography.labelSmall,color=Color.Gray);Text(value,style=MaterialTheme.typography.bodyMedium)}}
    }},confirmButton={Button(onClick=onDismiss){Text("Done")}})
}

@Composable
private fun ChoiceField(label:String,value:String,options:List<Pair<String,String>>,onChange:(String)->Unit){
    var expanded by remember{mutableStateOf(false)}
    Column{Text(label,style=MaterialTheme.typography.labelMedium);Box{OutlinedButton(onClick={expanded=true},modifier=Modifier.fillMaxWidth()){Text(options.firstOrNull{it.first==value}?.second?:"Select $label",modifier=Modifier.weight(1f));Icon(Icons.Outlined.ArrowDropDown,null)};DropdownMenu(expanded=expanded,onDismissRequest={expanded=false}){options.forEach{(id,title)->DropdownMenuItem(text={Text(title)},onClick={onChange(id);expanded=false})}}}}
}

@Composable
private fun GisImportDialog(parsed:JSONObject,fileName:String,api:ApiClient,onDismiss:()->Unit,onPublish:(JSONObject)->Unit){
    var projects by remember{mutableStateOf<List<JSONObject>>(emptyList())};var assets by remember{mutableStateOf<List<JSONObject>>(emptyList())};var layers by remember{mutableStateOf<List<JSONObject>>(emptyList())}
    var projectId by remember{mutableStateOf("")};var assetType by remember{mutableStateOf("")};var layerName by remember{mutableStateOf(fileName.replace(Regex("\\.(kml|kmz|zip)$",RegexOption.IGNORE_CASE),"").replace('-', ' ').replace('_',' '))};var description by remember{mutableStateOf("Imported infrastructure network")};var sourceIdField by remember{mutableStateOf("")};var nameField by remember{mutableStateOf("")};var replaceLayerId by remember{mutableStateOf("")}
    val fields=remember(parsed){parsed.optJSONArray("fields")?.let{array->(0 until array.length()).map{array.optString(it)}}.orEmpty()}
    val warnings=remember(parsed){parsed.optJSONArray("warnings")?.let{array->(0 until array.length()).map{array.optString(it)}}.orEmpty()}
    LaunchedEffect(Unit){runCatching{projects=jsonObjects(api.array("/api/projects"));assets=jsonObjects(api.array("/api/assets"));layers=jsonObjects(api.array("/api/gis/layers"));projectId=projects.firstOrNull()?.optString("id").orEmpty();assetType=assets.firstOrNull()?.optString("type")?:projects.firstOrNull()?.optString("assetType").orEmpty();sourceIdField=fields.firstOrNull{it.matches(Regex("(?i)asset_?id|id|uid"))}.orEmpty();nameField=fields.firstOrNull{it.equals("name",true)}.orEmpty()}}
    val types=(assets.map{it.optString("type")}+projects.map{it.optString("assetType")}).filter{it.isNotBlank()}.distinct()
    val projectLayers=layers.filter{it.optString("projectId")==projectId&&it.optBoolean("visible",true)}
    AlertDialog(onDismissRequest=onDismiss,title={Text("Publish GIS network")},text={LazyColumn(Modifier.heightIn(max=560.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
        item{Surface(color=Sky,shape=RoundedCornerShape(12.dp)){Column(Modifier.padding(12.dp)){Text(fileName,fontWeight=FontWeight.Bold);Text("${parsed.optString("format")} · ${parsed.optJSONObject("featureCollection")?.optJSONArray("features")?.length()?:0} mapped features",style=MaterialTheme.typography.bodySmall)}}}
        item{ChoiceField("Project",projectId,projects.map{it.optString("id") to "${it.optString("code")} · ${it.optString("name")}"}){projectId=it;replaceLayerId=""}}
        item{ChoiceField("Asset type",assetType,types.map{it to it}){assetType=it}}
        item{OutlinedTextField(layerName,{layerName=it},label={Text("Layer name")},modifier=Modifier.fillMaxWidth())}
        item{OutlinedTextField(description,{description=it},label={Text("Description")},modifier=Modifier.fillMaxWidth())}
        if(fields.isNotEmpty()){item{ChoiceField("Unique source ID",sourceIdField,listOf("" to "Generate deterministic IDs")+fields.map{it to it}){sourceIdField=it}};item{ChoiceField("Feature name",nameField,listOf("" to "Generate names")+fields.map{it to it}){nameField=it}}}
        if(projectLayers.isNotEmpty())item{ChoiceField("Replace layer",replaceLayerId,listOf("" to "Publish as a new layer")+projectLayers.map{it.optString("id") to "${it.optString("name")} · v${it.optInt("version")}"}){replaceLayerId=it}}
        if(warnings.isNotEmpty())item{Text(warnings.joinToString("\n"),color=Color(0xFF8A5A00),style=MaterialTheme.typography.bodySmall)}
        item{Text("The server validates source IDs, publishes a versioned layer, creates or updates assets, and keeps the import reversible.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)}
    }},confirmButton={Button(enabled=projectId.isNotBlank()&&assetType.isNotBlank()&&layerName.length>=3,onClick={onPublish(JSONObject().put("projectId",projectId).put("assetType",assetType).put("layerName",layerName).put("description",description).put("fileName",fileName).put("format",parsed.getString("format")).put("sourceIdField",sourceIdField.takeIf{it.isNotBlank()}?:JSONObject.NULL).put("nameField",nameField.takeIf{it.isNotBlank()}?:JSONObject.NULL).put("replaceLayerId",replaceLayerId.takeIf{it.isNotBlank()}?:JSONObject.NULL).put("style",JSONObject().put("color","#104685").put("width",5).put("opacity",0.82)).put("featureCollection",parsed.getJSONObject("featureCollection")).put("warnings",parsed.optJSONArray("warnings")?:JSONArray()))}){Text("Publish")}},dismissButton={TextButton(onClick=onDismiss){Text("Cancel")}})
}

@Composable private fun EmptyState(text:String){Surface(color=Sky,shape=RoundedCornerShape(16.dp)){Column(Modifier.fillMaxWidth().padding(28.dp),horizontalAlignment=Alignment.CenterHorizontally){Icon(Icons.Outlined.Inbox,null,tint=Navy,modifier=Modifier.size(40.dp));Spacer(Modifier.height(8.dp));Text(text)}}}

@Composable
private fun CreateDialog(kind:String,vm:AppViewModel,api:ApiClient,onDismiss:()->Unit,onCreate:(Map<String,String>)->Unit){
    val context=androidx.compose.ui.platform.LocalContext.current
    val scope=rememberCoroutineScope();val location=remember{LocationController(context)}
    var projects by remember{mutableStateOf<List<JSONObject>>(emptyList())};var users by remember{mutableStateOf<List<JSONObject>>(emptyList())};var assets by remember{mutableStateOf<List<JSONObject>>(emptyList())};var tenants by remember{mutableStateOf<List<JSONObject>>(emptyList())}
    var first by remember{mutableStateOf("")};var second by remember{mutableStateOf("")};var third by remember{mutableStateOf("")};var fourth by remember{mutableStateOf("")};var fifth by remember{mutableStateOf("")}
    var projectId by remember{mutableStateOf("")};var makerId by remember{mutableStateOf("")};var checkerId by remember{mutableStateOf("")};var authorityId by remember{mutableStateOf("")};var assetId by remember{mutableStateOf("")}
    var role by remember{mutableStateOf("maker")};var designation by remember{mutableStateOf("Field user")};var tenantId by remember{mutableStateOf("")};var bulkUsers by remember{mutableStateOf("")};var assetType by remember{mutableStateOf("Road")};var condition by remember{mutableStateOf("Good")};var attributes by remember{mutableStateOf("")}
    var lat by remember{mutableStateOf("28.613900")};var lng by remember{mutableStateOf("77.209000")};var radius by remember{mutableStateOf("250")};var inspectionType by remember{mutableStateOf("Requested")};var scheduledAt by remember{mutableStateOf(Instant.now().plusSeconds(86_400).toString())};var inspectionChecklist by remember{mutableStateOf("Structural condition, Electrical safety, Fire safety")}
    var hierarchy by remember{mutableStateOf("Head Office > Division > Site")};var modules by remember{mutableStateOf("Asset Management, Attendance, Inspections, Defect Management")};var tenantAssetType by remember{mutableStateOf("Road")};var tenantAttributes by remember{mutableStateOf("Length, Surface")};var tenantChecklist by remember{mutableStateOf("Surface condition, Drainage, Safety")};var additionalAssetTypes by remember{mutableStateOf("")};var slas by remember{mutableStateOf("24,72,168,360")};var dataMigration by remember{mutableStateOf(false)};var initialAdminName by remember{mutableStateOf("")};var initialAdminEmail by remember{mutableStateOf("")};var initialAdminMobile by remember{mutableStateOf("")}
    var evidence by remember{mutableStateOf<Uri?>(null)};var pendingCameraUri by remember{mutableStateOf<Uri?>(null)}
    val picker=rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()){evidence=it}
    val camera=rememberLauncherForActivityResult(ActivityResultContracts.TakePicture()){ok->if(ok)evidence=pendingCameraUri}
    val geoPermission=rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){grants->if(grants.values.any{it})scope.launch{location.current()?.let{gps->lat="%.6f".format(gps.latitude);lng="%.6f".format(gps.longitude);third=runCatching{api.reverseGeocode(gps.latitude,gps.longitude)}.getOrDefault("$lat, $lng")}}}
    fun capture(){val dir=File(context.cacheDir,"field-evidence").apply{mkdirs()};val file=File(dir,"defect-${System.currentTimeMillis()}.jpg");pendingCameraUri=FileProvider.getUriForFile(context,"${context.packageName}.files",file);camera.launch(pendingCameraUri!!)}
    val labels=when(kind){"defects"->listOf("Issue title","Description","Severity (Low/Medium/High/Critical)");"tickets"->listOf("Subject","Description","Priority");"payments"->listOf("Invoice number","Amount","Attendance reference");"attendance"->listOf("Project ID",""," ");"projects"->listOf("Project code","Project name","Location");"assets"->listOf("Asset name","Asset type","Location");"users"->listOf("Full name","Email","Mobile");"tenants"->listOf("Organisation name","Short name","Organisation type");"inspections"->listOf("Project ID","Asset ID","Checker ID");else->listOf("Name","Description","")}
    LaunchedEffect(Unit){runCatching{projects=jsonObjects(api.array("/api/projects"));users=jsonObjects(api.array("/api/users"));assets=jsonObjects(api.array("/api/assets"));if(vm.session?.user?.role==Role.TENANT_ADMIN)tenants=jsonObjects(api.array("/api/tenants"));projectId=projects.firstOrNull()?.optString("id").orEmpty();tenantId=tenants.firstOrNull()?.optString("id").orEmpty();makerId=users.firstOrNull{it.optString("role")=="maker"}?.optString("id").orEmpty();checkerId=users.firstOrNull{it.optString("role")=="checker"}?.optString("id").orEmpty();authorityId=users.firstOrNull{it.optString("role")=="authority"}?.optString("id").orEmpty();assetId=assets.firstOrNull()?.optString("id").orEmpty();assetType=projects.firstOrNull()?.optString("assetType").takeUnless{it.isNullOrBlank()}?:"Road"}}
    AlertDialog(onDismissRequest=onDismiss,title={Text("Create ${kind.replaceFirstChar(Char::uppercase)}")},text={LazyColumn(Modifier.heightIn(max=570.dp),verticalArrangement=Arrangement.spacedBy(10.dp)){
        item{OutlinedTextField(first,{first=it},label={Text(labels[0])},modifier=Modifier.fillMaxWidth())}
        if(labels[1].isNotBlank())item{OutlinedTextField(second,{second=it},label={Text(labels[1])},modifier=Modifier.fillMaxWidth())}
        if(labels[2].isNotBlank())item{OutlinedTextField(third,{third=it},label={Text(labels[2])},modifier=Modifier.fillMaxWidth())}
        if(kind=="users"){if(vm.session?.user?.role==Role.TENANT_ADMIN)item{ChoiceField("Tenant",tenantId,listOf("" to "Platform-wide / no tenant")+tenants.map{it.optString("id") to it.optString("name")}){tenantId=it}};item{ChoiceField("Role",role,listOf("authority" to "Authority","maker" to "Maker","checker" to "Checker")){role=it}};item{OutlinedTextField(designation,{designation=it},label={Text("Designation")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(bulkUsers,{bulkUsers=it},label={Text("Bulk users · Name | email | mobile | role | designation")},supportingText={Text("Optional: one user per line. Bulk rows use the selected tenant.")},minLines=3,modifier=Modifier.fillMaxWidth())}}
        if(kind=="projects"){
            item{NativeMap(MapData(emptyList(),emptyList(),emptyList()),lat.toDoubleOrNull()?.let{la->lng.toDoubleOrNull()?.let{lo->MapPoint(la,lo,"Project centre","Selection")}},onSelect={point->lat="%.6f".format(point.lat);lng="%.6f".format(point.lng);scope.launch{third=runCatching{api.reverseGeocode(point.lat,point.lng)}.getOrDefault("$lat, $lng")}},modifier=Modifier.fillMaxWidth().height(220.dp))}
            item{ChoiceField("Primary asset type",assetType,(projects.map{it.optString("assetType")}+assets.map{it.optString("type")}).filter{it.isNotBlank()}.distinct().ifEmpty{listOf("Road")}.map{it to it}){assetType=it}}
            item{ChoiceField("Assigned Maker",makerId,listOf("" to "Assign later")+users.filter{it.optString("role")=="maker"&&it.optBoolean("active",true)}.map{it.optString("id") to it.optString("name")}){makerId=it}}
            item{ChoiceField("Assigned Checker",checkerId,listOf("" to "Assign later")+users.filter{it.optString("role")=="checker"&&it.optBoolean("active",true)}.map{it.optString("id") to it.optString("name")}){checkerId=it}}
            item{Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){OutlinedTextField(lat,{lat=it},label={Text("Latitude")},modifier=Modifier.weight(1f));OutlinedTextField(lng,{lng=it},label={Text("Longitude")},modifier=Modifier.weight(1f))}}
            item{OutlinedTextField(radius,{radius=it},label={Text("Geofence radius · metres")},modifier=Modifier.fillMaxWidth())};item{OutlinedButton(onClick={geoPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.MyLocation,null);Spacer(Modifier.width(8.dp));Text("Use current GPS and address")}}
        }
        if(kind=="assets"){
            item{NativeMap(MapData(emptyList(),emptyList(),emptyList()),lat.toDoubleOrNull()?.let{la->lng.toDoubleOrNull()?.let{lo->MapPoint(la,lo,"Asset location","Selection")}},onSelect={point->lat="%.6f".format(point.lat);lng="%.6f".format(point.lng);scope.launch{third=runCatching{api.reverseGeocode(point.lat,point.lng)}.getOrDefault("$lat, $lng")}},modifier=Modifier.fillMaxWidth().height(220.dp))}
            item{ChoiceField("Project",projectId,projects.map{it.optString("id") to "${it.optString("code")} · ${it.optString("name")}"}){projectId=it}};item{ChoiceField("Condition",condition,listOf("Good","Fair","Attention","Critical").map{it to it}){condition=it}};item{OutlinedTextField(attributes,{attributes=it},label={Text("Attributes · one key=value per line")},minLines=3,modifier=Modifier.fillMaxWidth())};item{Row(horizontalArrangement=Arrangement.spacedBy(8.dp)){OutlinedTextField(lat,{lat=it},label={Text("Latitude")},modifier=Modifier.weight(1f));OutlinedTextField(lng,{lng=it},label={Text("Longitude")},modifier=Modifier.weight(1f))}};item{OutlinedButton(onClick={geoPermission.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION))},modifier=Modifier.fillMaxWidth()){Text("Place at current GPS")}}
        }
        if(kind=="payments"){item{ChoiceField("Project",projectId,projects.map{it.optString("id") to "${it.optString("code")} · ${it.optString("name")}"}){projectId=it}};item{ChoiceField("Checker",checkerId,users.filter{it.optString("role")=="checker"&&it.optBoolean("active",true)}.map{it.optString("id") to it.optString("name")}){checkerId=it}};item{ChoiceField("Authority",authorityId,users.filter{it.optString("role")=="authority"&&it.optBoolean("active",true)}.map{it.optString("id") to it.optString("name")}){authorityId=it}};item{OutlinedTextField(fourth,{fourth=it},label={Text("Inspection reference")},modifier=Modifier.fillMaxWidth())}}
        if(kind=="inspections"){item{ChoiceField("Project",projectId,projects.map{it.optString("id") to "${it.optString("code")} · ${it.optString("name")}"}){projectId=it}};item{ChoiceField("Asset",assetId,assets.filter{projectId.isBlank()||it.optString("projectId")==projectId}.map{it.optString("id") to it.optString("name")}){assetId=it}};item{ChoiceField("Type",inspectionType,listOf("Requested" to "Request for Inspection","Joint" to "Joint inspection")){inspectionType=it}};item{ChoiceField("Maker",makerId,users.filter{it.optString("role")=="maker"}.map{it.optString("id") to it.optString("name")}){makerId=it}};item{ChoiceField("Checker",checkerId,users.filter{it.optString("role")=="checker"}.map{it.optString("id") to it.optString("name")}){checkerId=it}};item{OutlinedTextField(scheduledAt,{scheduledAt=it},label={Text("Scheduled time · ISO 8601")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(inspectionChecklist,{inspectionChecklist=it},label={Text("Checklist items · comma separated")},minLines=3,modifier=Modifier.fillMaxWidth())}}
        if(kind=="tenants"){
            item{OutlinedTextField(hierarchy,{hierarchy=it},label={Text("Organisation hierarchy")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(modules,{modules=it},label={Text("Enabled modules · comma separated")},minLines=2,modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(tenantAssetType,{tenantAssetType=it},label={Text("Initial asset type")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(tenantAttributes,{tenantAttributes=it},label={Text("Asset attributes · comma separated")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(tenantChecklist,{tenantChecklist=it},label={Text("Inspection checklist · comma separated")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(additionalAssetTypes,{additionalAssetTypes=it},label={Text("Additional asset types · Name | attrs | checklist")},minLines=3,modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(slas,{slas=it},label={Text("SLA hours · Critical, High, Medium, Low")},modifier=Modifier.fillMaxWidth())};item{Row(verticalAlignment=Alignment.CenterVertically){Switch(checked=dataMigration,onCheckedChange={dataMigration=it});Spacer(Modifier.width(10.dp));Column{Text("Existing-data migration required",fontWeight=FontWeight.Bold);Text("Flags this tenant for a reviewed migration plan.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)}}};item{Text("Optional initial Authority administrator",fontWeight=FontWeight.Bold)};item{OutlinedTextField(initialAdminName,{initialAdminName=it},label={Text("Admin name")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(initialAdminEmail,{initialAdminEmail=it},label={Text("Admin email")},modifier=Modifier.fillMaxWidth())};item{OutlinedTextField(initialAdminMobile,{initialAdminMobile=it},label={Text("Admin mobile")},modifier=Modifier.fillMaxWidth())}
        }
        if(kind=="defects"){item{Button(onClick={capture()},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.PhotoCamera,null);Spacer(Modifier.width(8.dp));Text("Capture photo")}};item{OutlinedButton(onClick={picker.launch(arrayOf("image/*","video/*"))},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.AttachFile,null);Spacer(Modifier.width(8.dp));Text("Choose photo or video")}};if(evidence!=null)item{Text("Evidence ready",color=Color(0xFF1A7F4B),fontWeight=FontWeight.Bold)}}
        item{Text("All assignments, geofences and configuration values are validated by the server before creation.",style=MaterialTheme.typography.bodySmall,color=Color.Gray)}
    }},confirmButton={Button(enabled=(first.isNotBlank()||kind in setOf("attendance","inspections")||(kind=="users"&&bulkUsers.isNotBlank()))&&(kind!="defects"||evidence!=null),onClick={onCreate(mapOf("first" to first,"second" to second,"third" to third,"fourth" to fourth,"fifth" to fifth,"evidence" to (evidence?.toString().orEmpty()),"projectId" to projectId,"makerId" to makerId,"checkerId" to checkerId,"authorityId" to authorityId,"assetId" to assetId,"tenantId" to tenantId,"bulkUsers" to bulkUsers,"role" to role,"designation" to designation,"assetType" to assetType,"condition" to condition,"attributes" to attributes,"lat" to lat,"lng" to lng,"radius" to radius,"inspectionType" to inspectionType,"scheduledAt" to scheduledAt,"inspectionChecklist" to inspectionChecklist,"hierarchy" to hierarchy,"modules" to modules,"tenantAssetType" to tenantAssetType,"tenantAttributes" to tenantAttributes,"tenantChecklist" to tenantChecklist,"additionalAssetTypes" to additionalAssetTypes,"slas" to slas,"dataMigration" to dataMigration.toString(),"initialAdminName" to initialAdminName,"initialAdminEmail" to initialAdminEmail,"initialAdminMobile" to initialAdminMobile))}){Text("Submit")}},dismissButton={TextButton(onClick=onDismiss){Text("Cancel")}})
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
        "payments"->JSONObject().put("projectId",fields["projectId"].orEmpty().ifBlank{project?.optString("id").orEmpty()}).put("invoiceNo",fields["first"]).put("checkerId",fields["checkerId"].orEmpty().ifBlank{checker?.optString("id").orEmpty()}).put("authorityId",fields["authorityId"].orEmpty().ifBlank{authority?.optString("id").orEmpty()}).put("amount",fields["second"]?.toDoubleOrNull()?:1.0).put("attendanceReference",fields["third"]).put("inspectionReference",fields["fourth"].orEmpty().ifBlank{"Native app claim"})
        "projects"->JSONObject().put("code",fields["first"]).put("name",fields["second"]).put("location",fields["third"]).put("assetType",fields["assetType"].orEmpty().ifBlank{"Road"}).put("makerIds",JSONArray().apply{fields["makerId"]?.takeIf{it.isNotBlank()}?.let{value->put(value)}}).put("checkerIds",JSONArray().apply{fields["checkerId"]?.takeIf{it.isNotBlank()}?.let{value->put(value)}}).put("center",JSONObject().put("lat",fields["lat"]?.toDoubleOrNull()?:28.6139).put("lng",fields["lng"]?.toDoubleOrNull()?:77.2090)).put("geofenceRadiusMeters",fields["radius"]?.toIntOrNull()?:250)
        "assets"->{val attrs=JSONObject();fields["attributes"].orEmpty().lineSequence().map{it.split('=',limit=2)}.filter{it.size==2&&it[0].isNotBlank()}.forEach{attrs.put(it[0].trim(),it[1].trim())};JSONObject().put("projectId",fields["projectId"].orEmpty().ifBlank{project?.optString("id").orEmpty()}).put("name",fields["first"]).put("type",fields["second"].orEmpty().ifBlank{fields["assetType"].orEmpty()}).put("location",fields["third"]).put("condition",fields["condition"].orEmpty().ifBlank{"Good"}).put("attributes",attrs).put("geometry",JSONObject().put("type","Point").put("coordinates",JSONArray().put(fields["lng"]?.toDoubleOrNull()?:77.2090).put(fields["lat"]?.toDoubleOrNull()?:28.6139))).put("layerId",JSONObject.NULL)}
        "users"->{
            val selectedTenant=fields["tenantId"].orEmpty()
            val rows=fields["bulkUsers"].orEmpty().lineSequence().filter{it.isNotBlank()}.map{it.split('|').map(String::trim)}.toList()
            if(rows.isNotEmpty()){
                rows.forEach{parts->
                    require(parts.size>=3){"Each bulk user needs Name | email | mobile | role | designation."}
                    val userBody=JSONObject().put("name",parts[0]).put("email",parts[1]).put("mobile",parts[2]).put("role",parts.getOrNull(3).orEmpty().ifBlank{"maker"}).put("designation",parts.getOrNull(4).orEmpty().ifBlank{"Field user"})
                    userBody.put("tenantId",selectedTenant.takeIf{it.isNotBlank()}?:JSONObject.NULL)
                    api.post("/api/users",userBody)
                }
                return
            }
            JSONObject().put("name",fields["first"]).put("email",fields["second"]).put("mobile",fields["third"]).put("role",fields["role"].orEmpty().ifBlank{"maker"}).put("designation",fields["designation"].orEmpty().ifBlank{"Field user"}).put("tenantId",selectedTenant.takeIf{it.isNotBlank()}?:JSONObject.NULL)
        }
        "tenants"->{
            fun csv(name:String)=JSONArray(fields[name].orEmpty().split(',').map{it.trim()}.filter{it.isNotBlank()})
            val hours=fields["slas"].orEmpty().split(',').mapNotNull{it.trim().toIntOrNull()}
            val types=JSONArray().put(JSONObject().put("name",fields["tenantAssetType"].orEmpty().ifBlank{"Road"}).put("attributes",csv("tenantAttributes")).put("checklist",csv("tenantChecklist")))
            fields["additionalAssetTypes"].orEmpty().lineSequence().filter{it.isNotBlank()}.forEach{line->val parts=line.split('|',limit=3).map{it.trim()};if(parts[0].isNotBlank())types.put(JSONObject().put("name",parts[0]).put("attributes",JSONArray(parts.getOrNull(1).orEmpty().split(',').map{it.trim()}.filter{it.isNotBlank()})).put("checklist",JSONArray(parts.getOrNull(2).orEmpty().split(',').map{it.trim()}.filter{it.isNotBlank()})))}
            JSONObject().put("name",fields["first"]).put("shortName",fields["second"]).put("type",fields["third"]).put("hierarchy",fields["hierarchy"].orEmpty().ifBlank{"Head Office > Division > Site"}).put("modules",csv("modules")).put("assetTypes",types).put("slas",JSONObject().put("Critical",hours.getOrNull(0)?:24).put("High",hours.getOrNull(1)?:72).put("Medium",hours.getOrNull(2)?:168).put("Low",hours.getOrNull(3)?:360)).put("dataMigration",fields["dataMigration"].toBoolean()).apply{if(fields["initialAdminName"].orEmpty().isNotBlank())put("initialAdmin",JSONObject().put("name",fields["initialAdminName"]).put("email",fields["initialAdminEmail"]).put("mobile",fields["initialAdminMobile"]).put("designation","Authority Administrator"))}
        }
        "inspections"->JSONObject().put("projectId",fields["projectId"].orEmpty().ifBlank{project?.optString("id").orEmpty()}).put("assetId",fields["assetId"].orEmpty().ifBlank{assets.firstOrNull()?.optString("id").orEmpty()}).put("type",fields["inspectionType"].orEmpty().ifBlank{"Requested"}).put("makerId",fields["makerId"].orEmpty().ifBlank{maker?.optString("id").orEmpty()}).put("checkerId",fields["checkerId"].orEmpty().ifBlank{checker?.optString("id").orEmpty()}).put("scheduledAt",fields["scheduledAt"].orEmpty().ifBlank{Instant.now().toString()}).put("checklist",JSONArray(fields["inspectionChecklist"].orEmpty().split(',').map{it.trim()}.filter{it.isNotBlank()}))
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
private fun SearchScreen(vm:AppViewModel,api:ApiClient){var q by remember{mutableStateOf("")};var selected by remember{mutableStateOf<JSONObject?>(null)};val scope=rememberCoroutineScope();Column(Modifier.fillMaxSize().padding(16.dp)){OutlinedTextField(q,{q=it;scope.launch{vm.search(api,it)}},modifier=Modifier.fillMaxWidth(),label={Text("Search all IIMM records")},leadingIcon={Icon(Icons.Outlined.Search,null)});Spacer(Modifier.height(12.dp));LazyColumn(verticalArrangement=Arrangement.spacedBy(8.dp)){items(vm.searchResults){r->ElevatedCard(onClick={selected=r},modifier=Modifier.fillMaxWidth()){ListItem(headlineContent={Text(r.optString("title"),fontWeight=FontWeight.Bold)},supportingContent={Text(r.optString("subtitle"))},leadingContent={Surface(color=Sky,shape=RoundedCornerShape(40.dp)){Text(r.optString("type"),style=MaterialTheme.typography.labelSmall,color=Navy,modifier=Modifier.padding(horizontal=8.dp,vertical=6.dp))}},trailingContent={Icon(Icons.Outlined.ChevronRight,null)})}}}};selected?.let{result->RecordDetailDialog(result.optJSONObject("record")?:result,result.optString("type","search"),onDismiss={selected=null})}}

@Composable
private fun MoreScreen(vm:AppViewModel,api:ApiClient,logout:()->Unit){
    val scope=rememberCoroutineScope();val user=vm.session!!.user;val context=androidx.compose.ui.platform.LocalContext.current;val pendingOffline=remember{OfflineQueue(context).all().size}
    fun export(type:String){scope.launch{vm.action{val data=api.download("/api/reports/$type.csv");val name="iimm-$type-report.csv";if(Build.VERSION.SDK_INT>=29){val values=ContentValues().apply{put(MediaStore.Downloads.DISPLAY_NAME,name);put(MediaStore.Downloads.MIME_TYPE,"text/csv");put(MediaStore.Downloads.RELATIVE_PATH,"Download/IIMM")};val uri=context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI,values)?:error("Unable to create report file");context.contentResolver.openOutputStream(uri)?.use{it.write(data)}?:error("Unable to write report file")}else{context.getExternalFilesDir(null)?.resolve(name)?.writeBytes(data)};vm.error="$name was saved to Downloads/IIMM."}}}
    LazyColumn(Modifier.fillMaxSize().padding(16.dp),verticalArrangement=Arrangement.spacedBy(12.dp)){item{ElevatedCard(Modifier.fillMaxWidth()){ListItem(headlineContent={Text(user.name,fontWeight=FontWeight.Bold)},supportingContent={Text("${user.designation} · ${user.role.label}\n${user.email}")},leadingContent={Icon(Icons.Outlined.AccountCircle,null,tint=Navy,modifier=Modifier.size(40.dp))})}};item{ElevatedCard(Modifier.fillMaxWidth()){ListItem(headlineContent={Text("$pendingOffline pending offline changes",fontWeight=FontWeight.Bold)},supportingContent={Text(if(pendingOffline==0)"All captured field work is synced." else "Saved evidence and field changes will retry automatically when connected.")},leadingContent={Icon(Icons.Outlined.Sync,null,tint=Navy)})}};if(user.role in setOf(Role.TENANT_ADMIN,Role.AUTHORITY,Role.CHECKER)){item{Text("CSV reports",fontWeight=FontWeight.Bold)};items(listOf("projects","assets","defects","payments","attendance")){type->OutlinedButton(onClick={export(type)},modifier=Modifier.fillMaxWidth()){Icon(Icons.Outlined.Download,null);Spacer(Modifier.width(8.dp));Text("Export ${type.replaceFirstChar(Char::uppercase)}")}}};item{OutlinedButton(onClick={scope.launch{api.post("/api/notifications/read-all")}},modifier=Modifier.fillMaxWidth()){Text("Mark all notifications read")}};item{OutlinedButton(onClick=logout,modifier=Modifier.fillMaxWidth(),colors=ButtonDefaults.outlinedButtonColors(contentColor=Color.Red)){Icon(Icons.Outlined.Logout,null);Spacer(Modifier.width(8.dp));Text("Sign out")}};item{Text("Native build 1.0.0\nAPI ${BuildConfig.API_BASE_URL}\nMappls SDK: ${when{IimmApplication.mapplsReady->"connected";IimmApplication.mapplsError!=null->"configuration needs attention";else->"credentials required"}}",style=MaterialTheme.typography.bodySmall,color=Color.Gray)}}
}
