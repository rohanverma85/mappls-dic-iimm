package com.mappls.dic.iimm

import android.content.Context
import android.graphics.Color
import android.os.Bundle
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Map
import androidx.compose.material.icons.outlined.WarningAmber
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color as ComposeColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.mappls.sdk.maps.MapView
import com.mappls.sdk.maps.MapplsMap
import com.mappls.sdk.maps.OnMapReadyCallback
import com.mappls.sdk.maps.annotations.MarkerOptions
import com.mappls.sdk.maps.annotations.PolygonOptions
import com.mappls.sdk.maps.annotations.PolylineOptions
import com.mappls.sdk.maps.camera.CameraUpdateFactory
import com.mappls.sdk.maps.geometry.LatLng
import org.json.JSONArray
import org.json.JSONObject

data class MapPoint(val lat: Double, val lng: Double, val title: String, val kind: String)
data class MapLine(val points: List<LatLng>, val color: String, val width: Float)
data class MapPolygon(val points: List<LatLng>, val color: String)
data class MapData(val points: List<MapPoint>, val lines: List<MapLine>, val polygons: List<MapPolygon>)

private fun valid(lat: Double, lng: Double) = lat.isFinite() && lng.isFinite() && lat in -90.0..90.0 && lng in -180.0..180.0 && !(lat == 0.0 && lng == 0.0)

fun parseMapData(overview: JSONObject): MapData {
    val points = mutableListOf<MapPoint>()
    val lines = mutableListOf<MapLine>()
    val polygons = mutableListOf<MapPolygon>()
    fun geometry(geometry: JSONObject, title: String, color: String = "#104685") {
        val type = geometry.optString("type")
        val coordinates = geometry.optJSONArray("coordinates") ?: return
        fun pair(value: JSONArray): LatLng? {
            val lng = value.optDouble(0, Double.NaN); val lat = value.optDouble(1, Double.NaN)
            return if (valid(lat, lng)) LatLng(lat, lng) else null
        }
        when (type) {
            "Point" -> pair(coordinates)?.let { points += MapPoint(it.latitude, it.longitude, title, "Asset") }
            "LineString" -> (0 until coordinates.length()).mapNotNull { coordinates.optJSONArray(it)?.let(::pair) }.takeIf { it.size > 1 }?.let { lines += MapLine(it, color, 4f) }
            "MultiLineString" -> (0 until coordinates.length()).forEach { i -> coordinates.optJSONArray(i)?.let { line -> (0 until line.length()).mapNotNull { line.optJSONArray(it)?.let(::pair) }.takeIf { it.size > 1 }?.let { lines += MapLine(it, color, 4f) } } }
            "Polygon" -> coordinates.optJSONArray(0)?.let { ring -> (0 until ring.length()).mapNotNull { ring.optJSONArray(it)?.let(::pair) }.takeIf { it.size > 2 }?.let { polygons += MapPolygon(it, color) } }
            "MultiPolygon" -> (0 until coordinates.length()).forEach { i -> coordinates.optJSONArray(i)?.optJSONArray(0)?.let { ring -> (0 until ring.length()).mapNotNull { ring.optJSONArray(it)?.let(::pair) }.takeIf { it.size > 2 }?.let { polygons += MapPolygon(it, color) } } }
        }
    }
    overview.optJSONArray("projects")?.let { array -> (0 until array.length()).forEach { i -> array.optJSONObject(i)?.let { item -> item.optJSONObject("center")?.let { center -> val lat=center.optDouble("lat"); val lng=center.optDouble("lng"); if(valid(lat,lng)) points += MapPoint(lat,lng,item.optString("name","Project"),"Project") } } } }
    overview.optJSONArray("assets")?.let { array -> (0 until array.length()).forEach { i -> array.optJSONObject(i)?.let { geometry(it.optJSONObject("geometry") ?: return@let, it.optString("name","Asset")) } } }
    overview.optJSONArray("defects")?.let { array -> (0 until array.length()).forEach { i -> array.optJSONObject(i)?.let { item -> val lat=item.optDouble("lat"); val lng=item.optDouble("lng"); if(valid(lat,lng)) points += MapPoint(lat,lng,item.optString("title","Defect"),"Defect") } } }
    overview.optJSONArray("layers")?.let { array -> (0 until array.length()).forEach { i -> array.optJSONObject(i)?.takeIf { it.optBoolean("visible",true) }?.let { layer -> val color=layer.optJSONObject("style")?.optString("color","#104685") ?: "#104685"; layer.optJSONObject("featureCollection")?.optJSONArray("features")?.let { fs -> (0 until fs.length()).forEach { j -> fs.optJSONObject(j)?.optJSONObject("geometry")?.let { geometry(it,layer.optString("name","GIS layer"),color) } } } } } }
    return MapData(points, lines, polygons)
}

@Composable
fun NativeMap(data: MapData, selected: MapPoint?, onSelect: (MapPoint) -> Unit, modifier: Modifier = Modifier) {
    if (!IimmApplication.mapplsReady) {
        val message = when {
            IimmApplication.mapplsError != null -> "Mappls configuration needs attention\nThe supplied package or signing fingerprint does not match this app.\nOperational coordinates and GIS data remain available."
            else -> "Mappls native credentials required\nAdd *.a.conf and *.a.olf to mobile/android/app/.\nOperational coordinates and GIS data remain available."
        }
        Box(modifier.background(Brush.verticalGradient(listOf(ComposeColor(0xFFE8F3FB),ComposeColor(0xFFF6FAFD)))), contentAlignment = Alignment.Center) {
            Surface(shape=RoundedCornerShape(24.dp),color=ComposeColor.White,shadowElevation=6.dp,modifier=Modifier.fillMaxWidth().padding(22.dp)){
                Column(Modifier.padding(22.dp),horizontalAlignment=Alignment.CenterHorizontally){
                    Surface(color=ComposeColor(0xFFFFF3DD),shape=RoundedCornerShape(18.dp)){Icon(if(IimmApplication.mapplsError!=null)Icons.Outlined.WarningAmber else Icons.Outlined.Map,null,tint=ComposeColor(0xFF104685),modifier=Modifier.padding(14.dp).size(30.dp))}
                    Spacer(Modifier.height(14.dp))
                    Text(if(IimmApplication.mapplsError!=null)"Map configuration needs attention" else "Map credentials required",fontWeight=FontWeight.Bold,style=MaterialTheme.typography.titleLarge,color=ComposeColor(0xFF152238))
                    Spacer(Modifier.height(7.dp))
                    Text(message.substringAfter('\n'),style=MaterialTheme.typography.bodyMedium,color=ComposeColor(0xFF607089),modifier=Modifier.fillMaxWidth())
                }
            }
        }
        return
    }
    val mapView = remember { mutableStateOf<MapView?>(null) }
    val map = remember { mutableStateOf<MapplsMap?>(null) }
    AndroidView(
        modifier = modifier,
        factory = { context ->
            MapView(context).also { view ->
                mapView.value = view
                view.onCreate(Bundle())
                view.getMapAsync(object : OnMapReadyCallback {
                    override fun onMapReady(ready: MapplsMap) {
                        map.value = ready
                        ready.addOnMapClickListener { latLng -> onSelect(MapPoint(latLng.latitude, latLng.longitude, "Selected location", "Selection")); true }
                    }
                    override fun onMapError(code: Int, message: String?) = Unit
                })
            }
        }
    )
    LaunchedEffect(data, selected, map.value) {
        val ready = map.value ?: return@LaunchedEffect
        ready.clear()
        data.lines.forEach { line -> ready.addPolyline(PolylineOptions().addAll(line.points).color(Color.parseColor(line.color)).width(line.width)) }
        data.polygons.forEach { polygon -> ready.addPolygon(PolygonOptions().addAll(polygon.points).fillColor(Color.parseColor(polygon.color) and 0x44FFFFFF).strokeColor(Color.parseColor(polygon.color))) }
        (data.points + listOfNotNull(selected)).forEach { point -> ready.addMarker(MarkerOptions().position(LatLng(point.lat,point.lng)).title(point.title).snippet(point.kind)) }
        val focus = selected ?: data.points.firstOrNull()
        focus?.let { ready.animateCamera(CameraUpdateFactory.newLatLngZoom(LatLng(it.lat,it.lng), 13.0)) }
    }
    DisposableEffect(Unit) { onDispose { mapView.value?.onDestroy() } }
}
