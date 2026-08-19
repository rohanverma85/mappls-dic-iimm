import { useEffect, useMemo, useRef, useState } from 'react';
import { Crosshair, Layers3, LocateFixed, MapPinned, ShieldAlert } from 'lucide-react';
import type { Asset, Defect, GeoJsonFeature, GeoJsonGeometry, GisLayer, Project } from '../../shared/types';
import { api } from '../api';

interface MapplsConfig {
  provider: 'Mappls';
  configured: boolean;
  accessToken: string | null;
  sdkVersion: string;
  layer: string;
}

interface Props {
  layers?: GisLayer[];
  assets?: Asset[];
  defects?: Defect[];
  projects?: Project[];
  focus?: { lat:number; lng:number } | null;
  selectedLocation?: { lat:number; lng:number } | null;
  selectable?: boolean;
  onLocationSelect?: (point:{lat:number;lng:number})=>void;
  compact?: boolean;
  className?: string;
}

type MapplsMapInstance = {
  on?:(event:string,callback:(event?:unknown)=>void)=>void;
  addListener?:(event:string,callback:(event?:unknown)=>void)=>unknown;
  setCenter?:(position:{lat:number;lng:number}|[number,number])=>void;
  setZoom?:(zoom:number)=>void;
  loaded?:()=>boolean;
  isStyleLoaded?:()=>boolean;
  resize?:()=>void;
  remove?:()=>void;
};

type MapplsMarkerInstance = { setPosition?:(position:{lat:number;lng:number})=>void; remove?:()=>void };

type MapplsGlobal = {
  Map: new (id:string, options:Record<string,unknown>) => MapplsMapInstance;
  addGeoJson?: new (options:Record<string,unknown>) => unknown;
  Marker?: new (options:Record<string,unknown>) => MapplsMarkerInstance;
  Circle?: new (options:Record<string,unknown>) => unknown;
};

declare global { interface Window { mappls?: MapplsGlobal; Mappls?: MapplsGlobal } }

let sdkPromise: Promise<MapplsGlobal> | null = null;
function loadMappls(accessToken:string, version:string) {
  if (window.mappls || window.Mappls) return Promise.resolve((window.mappls || window.Mappls)!);
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<MapplsGlobal>((resolve,reject) => {
    const finish = () => {
      const sdk = window.mappls || window.Mappls;
      if (sdk) resolve(sdk); else reject(new Error('Mappls SDK loaded without a map object.'));
    };
    const fail = () => reject(new Error('Unable to load the Mappls Web Maps SDK.'));
    const script = document.createElement('script');
    // Keep the loader URL identical to the current Mappls Web Maps JS v3
    // documentation. In particular, v3 does not require a JSONP callback.
    script.src = `https://sdk.mappls.com/map/sdk/web?v=${encodeURIComponent(version)}&access_token=${encodeURIComponent(accessToken)}&layer=vector`;
    script.dataset.iimmMapplsSdk = 'true';
    script.async = true;
    script.defer = true;
    script.onload = finish;
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error) => {
    // A transient network or authorization failure must not poison every map
    // mounted later in the same SPA session.
    sdkPromise = null;
    throw error;
  });
  return sdkPromise;
}

function styledCollection(layer:GisLayer) {
  return {
    ...layer.featureCollection,
    features:layer.featureCollection.features.map((feature) => ({
      ...feature,
      properties:{ ...feature.properties, stroke:layer.style.color, 'stroke-width':layer.style.width, 'stroke-opacity':layer.style.opacity, fill:layer.style.color, 'fill-opacity':Math.min(layer.style.opacity,0.28) },
    })),
  };
}

function pointFromMapEvent(event:unknown):{lat:number;lng:number}|null {
  if(!event||typeof event!=='object')return null;
  const value=event as Record<string,unknown>;
  const candidate=(value.lngLat||value.latLng||value.latlng||value) as Record<string,unknown>;
  const lat=Number(candidate?.lat ?? candidate?.latitude);
  const lng=Number(candidate?.lng ?? candidate?.lon ?? candidate?.longitude);
  if(Number.isFinite(lat)&&Number.isFinite(lng))return {lat,lng};
  if(Array.isArray(value.lngLat)&&value.lngLat.length>=2)return {lng:Number(value.lngLat[0]),lat:Number(value.lngLat[1])};
  return null;
}

export default function MapplsMap({layers=[],assets=[],defects=[],projects=[],focus=null,selectedLocation=null,selectable=false,onLocationSelect,compact=false,className=''}:Props) {
  const id = useRef(`mappls-${Math.random().toString(36).slice(2)}`);
  const mapRef = useRef<MapplsMapInstance|null>(null);
  const selectedMarkerRef=useRef<MapplsMarkerInstance|null>(null);
  const onSelectRef=useRef(onLocationSelect);
  const [config,setConfig] = useState<MapplsConfig|null>(null);
  const [state,setState] = useState<'loading'|'live'|'fallback'|'error'>('loading');
  const center = focus ?? projects[0]?.center ?? (defects[0] ? {lat:defects[0].lat,lng:defects[0].lng} : {lat:28.6139,lng:77.2090});
  const layerSignature=JSON.stringify(layers),assetSignature=JSON.stringify(assets),defectSignature=JSON.stringify(defects),projectSignature=JSON.stringify(projects);

  useEffect(()=>{ api<MapplsConfig>('/api/mappls/config').then(setConfig).catch(()=>setState('fallback')); },[]);
  useEffect(()=>{onSelectRef.current=onLocationSelect;},[onLocationSelect]);
  useEffect(()=>{const target=selectedLocation??focus;if(target&&mapRef.current?.setCenter){try{mapRef.current.setCenter([target.lat,target.lng]);}catch{/* map remains interactive at its current viewport */}}},[selectedLocation?.lat,selectedLocation?.lng,focus?.lat,focus?.lng]);
  useEffect(()=>{
    if (!config) return;
    if (!config.configured || !config.accessToken) { setState('fallback'); return; }
    let disposed=false;
    let settleTimer:number|undefined;
    loadMappls(config.accessToken,config.sdkVersion).then((sdk)=>{
      if(disposed)return;
      // Keep construction to the minimal, documented Web Maps JS v3 shape.
      // Zoom and controls are applied after the SDK has created its canvas;
      // some SDK builds throw internally while normalising optional settings.
      const map = new sdk.Map(id.current,{center:{lat:center.lat,lng:center.lng}});
      mapRef.current=map;
      const rendered=new Set<string>();
      const render=(key:string,operation:()=>void)=>{
        if(rendered.has(key))return;
        try{operation();rendered.add(key);}catch{/* the settlement loop retries after the style becomes ready */}
      };
      const draw=()=>{
        layers.filter((layer)=>layer.visible&&layer.status==='Published').forEach((layer)=>render(`layer:${layer.id}`,()=>{ if(sdk.addGeoJson)new sdk.addGeoJson({map,data:styledCollection(layer),fitbounds:!compact,cType:0}); }));
        assets.forEach((asset)=>{
          render(`asset:${asset.id}`,()=>{
            if(asset.geometry.type==='Point'&&sdk.Marker)new sdk.Marker({map,position:{lat:asset.geometry.coordinates[1],lng:asset.geometry.coordinates[0]},fitbounds:false,popupHtml:`<strong>${asset.name}</strong><br/>${asset.type}<br/>${asset.condition}`});
            else if(sdk.addGeoJson)new sdk.addGeoJson({map,data:{type:'FeatureCollection',features:[{type:'Feature',geometry:asset.geometry,properties:{stroke:'#027a48','stroke-width':4,'stroke-opacity':0.9,fill:'#027a48','fill-opacity':0.2}}]},fitbounds:false,cType:0});
          });
        });
        defects.forEach((defect)=>render(`defect:${defect.id}`,()=>{ if(sdk.Marker)new sdk.Marker({map,position:{lat:defect.lat,lng:defect.lng},fitbounds:false,popupHtml:`<strong>${defect.id}</strong><br/>${defect.title}<br/>${defect.status}`}); }));
        projects.forEach((project)=>render(`project:${project.id}`,()=>{ if(sdk.Circle)new sdk.Circle({map,center:{lat:project.center.lat,lng:project.center.lng},radius:project.geofenceRadiusMeters,strokeColor:'#104685',strokeOpacity:0.7,fillColor:'#104685',fillOpacity:0.08}); }));
      };
      let attempts=0;
      const settle=()=>{
        if(disposed)return;
        attempts+=1;
        try{map.resize?.();}catch{/* the canvas probe below remains authoritative */}
        try{map.setZoom?.(compact?16:14);}catch{/* retry after the SDK finishes its style setup */}
        const host=document.getElementById(id.current);
        const canvasReady=Boolean(host?.querySelector('canvas'));
        let styleReady=canvasReady;
        try{styleReady=map.loaded?.()??map.isStyleLoaded?.()??canvasReady;}catch{/* Mappls can render before its readiness helpers settle */}
        if(canvasReady)setState('live');
        if(styleReady||canvasReady)draw();
        if((!canvasReady||rendered.size<layers.filter((layer)=>layer.visible&&layer.status==='Published').length+assets.length+defects.length+projects.length)&&attempts<20){
          settleTimer=window.setTimeout(settle,300);
        }
      };
      const ready=()=>{if(disposed)return;draw();setState('live');settle();};
      if(map.on)map.on('load',ready);else if(map.addListener)map.addListener('load',ready);
      // The current Mappls loader can create a usable MapLibre canvas without
      // emitting its public load event. Polling the actual canvas keeps the map
      // live and gives operational overlays a bounded retry window.
      window.requestAnimationFrame(settle);
      if(selectable){
        const select=(event?:unknown)=>{const point=pointFromMapEvent(event);if(!point)return;if(selectedMarkerRef.current?.setPosition)selectedMarkerRef.current.setPosition(point);else if(sdk.Marker)selectedMarkerRef.current=new sdk.Marker({map,position:point,fitbounds:false,popupHtml:'<strong>Selected location</strong>'});onSelectRef.current?.(point);};
        if(map.addListener)map.addListener('click',select);else map.on?.('click',select);
      }
    }).catch(()=>setState('error'));
    return()=>{disposed=true;if(settleTimer)window.clearTimeout(settleTimer);selectedMarkerRef.current?.remove?.();selectedMarkerRef.current=null;mapRef.current?.remove?.();mapRef.current=null;};
  },[config,compact,layerSignature,assetSignature,defectSignature,projectSignature,selectable]);

  return <div className={`mappls-shell ${compact?'compact':''} ${className}`}>
    {state!=='fallback'&&<div id={id.current} className="mappls-canvas"/>}
    {(state==='fallback'||state==='error')&&<FallbackMap layers={layers} assets={assets} defects={defects} projects={projects} focus={selectedLocation??focus} onSelect={selectable?onLocationSelect:undefined}/>}
    <div className="map-provider"><span>mappls</span><b>{state==='live'?'LIVE MAP':state==='loading'?'CONNECTING':'GIS PREVIEW'}</b></div>
    {selectable&&<div className="map-select-note"><Crosshair/> Click the map to mark a location</div>}
    <div className="map-status"><Layers3/>{layers.filter((layer)=>layer.visible).length} network layer{layers.length===1?'':'s'}<i/><MapPinned/>{defects.length} defect{defects.length===1?'':'s'}</div>
    {(state==='fallback'||state==='error')&&<div className="map-config-note"><ShieldAlert/><span><b>{state==='error'?'Mappls SDK unavailable':'Mappls access token required'}</b><small>The operational geometry remains usable; add a domain-whitelisted <code>MAPPLS_ACCESS_TOKEN</code> to enable the official vector basemap.</small></span></div>}
  </div>;
}

function positions(geometry:GeoJsonGeometry):[number,number][] {
  if(geometry.type==='Point')return [geometry.coordinates];
  if(geometry.type==='LineString')return geometry.coordinates;
  if(geometry.type==='MultiLineString'||geometry.type==='Polygon')return geometry.coordinates.flat();
  return geometry.coordinates.flat(2) as [number,number][];
}

function FallbackMap({layers,assets,defects,projects,focus,onSelect}:{layers:GisLayer[];assets:Asset[];defects:Defect[];projects:Project[];focus:{lat:number;lng:number}|null;onSelect?:((point:{lat:number;lng:number})=>void)}) {
  const features = useMemo(()=>[
    ...layers.filter((layer)=>layer.visible).flatMap((layer)=>layer.featureCollection.features.map((feature)=>({feature,color:layer.style.color,width:layer.style.width}))),
    ...assets.map((asset)=>({feature:{type:'Feature',id:asset.id,geometry:asset.geometry,properties:{}} as GeoJsonFeature,color:'#027a48',width:3})),
  ],[layers,assets]);
  const all = [...features.flatMap((item)=>positions(item.feature.geometry)),...defects.map((d)=>[d.lng,d.lat] as [number,number]),...projects.map((p)=>[p.center.lng,p.center.lat] as [number,number]),...(focus?[[focus.lng,focus.lat] as [number,number]]:[])];
  const bounded = all.length ? all : [[77.19,28.59],[77.23,28.63]] as [number,number][];
  const lngs=bounded.map((p)=>p[0]);const lats=bounded.map((p)=>p[1]);
  const minLng=Math.min(...lngs),maxLng=Math.max(...lngs),minLat=Math.min(...lats),maxLat=Math.max(...lats);
  const x=(lng:number)=>40+(lng-minLng)/Math.max(maxLng-minLng,0.0001)*720;
  const y=(lat:number)=>360-(lat-minLat)/Math.max(maxLat-minLat,0.0001)*320;
  const path=(geometry:GeoJsonGeometry)=>positions(geometry).map(([lng,lat],i)=>`${i?'L':'M'} ${x(lng)} ${y(lat)}`).join(' ')+(geometry.type.includes('Polygon')?' Z':'');
  function select(event:React.MouseEvent<SVGSVGElement>){if(!onSelect)return;const box=event.currentTarget.getBoundingClientRect();const sx=(event.clientX-box.left)/box.width*800;const sy=(event.clientY-box.top)/box.height*400;onSelect({lng:minLng+(sx-40)/720*Math.max(maxLng-minLng,0.0001),lat:minLat+(360-sy)/320*Math.max(maxLat-minLat,0.0001)});}
  return <div className="mappls-fallback"><svg viewBox="0 0 800 400" role="img" aria-label="Infrastructure network and defect map" onClick={select} className={onSelect?'selectable-map':''}>
    <defs><pattern id="mapGrid" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M44 0H0V44" fill="none" stroke="#c9d6e6" strokeWidth="1"/></pattern><filter id="pinShadow"><feDropShadow dx="0" dy="3" stdDeviation="3" floodOpacity=".25"/></filter></defs>
    <rect width="800" height="400" fill="#edf3f8"/><rect width="800" height="400" fill="url(#mapGrid)"/>
    <path d="M0 290 C150 250,235 320,390 270 S650 230,800 275" fill="none" stroke="#dbe8f1" strokeWidth="30"/><path d="M0 290 C150 250,235 320,390 270 S650 230,800 275" fill="none" stroke="#b8d6e8" strokeWidth="2"/>
    {features.map((item,index)=><path key={`${item.feature.id||index}`} d={path(item.feature.geometry)} fill={item.feature.geometry.type.includes('Polygon')?`${item.color}33`:'none'} stroke={item.color} strokeWidth={item.width} strokeLinecap="round" strokeLinejoin="round"/>)}
    {projects.map((project)=><g key={project.id}><circle cx={x(project.center.lng)} cy={y(project.center.lat)} r="34" fill="#10468512" stroke="#104685" strokeDasharray="6 5"/><text x={x(project.center.lng)+38} y={y(project.center.lat)-22}>{project.code}</text></g>)}
    {defects.map((defect)=><g key={defect.id} transform={`translate(${x(defect.lng)},${y(defect.lat)})`} filter="url(#pinShadow)"><path d="M0 19C-13 4-16-4-16-12A16 16 0 1 1 16-12C16-4 13 4 0 19Z" fill={defect.severity==='Critical'?'#d92d20':defect.severity==='High'?'#f79009':'#104685'} stroke="white" strokeWidth="3"/><circle cy="-12" r="5" fill="white"/><title>{defect.id} · {defect.title}</title></g>)}
    {focus&&<g transform={`translate(${x(focus.lng)},${y(focus.lat)})`}><circle r="22" fill="#1570ef22" stroke="#1570ef" strokeWidth="2"><animate attributeName="r" values="16;28;16" dur="2s" repeatCount="indefinite"/></circle><circle r="7" fill="#1570ef" stroke="white" strokeWidth="3"/></g>}
  </svg><div className="fallback-compass"><LocateFixed/></div></div>;
}
