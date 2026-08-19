import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileArchive, Layers3, UploadCloud } from 'lucide-react';
import type { GisLayer, Project, Session } from '../../shared/types';
import { post } from '../api';
import { parseGisFile, type ParsedGisFile } from '../gisImport';
import { Badge, Button, Field, Modal } from './UI';
import MapplsMap from './MapplsMap';

export interface GisImportResult { layer:GisLayer; importJob:{id:string;createdCount:number;updatedCount:number;featureCount:number;fileName:string} }

export default function GisImportModal({session,projects,layers,onClose,onPublished}:{session:Session;projects:Project[];layers:GisLayer[];onClose:()=>void;onPublished:(result:GisImportResult)=>void}) {
  const [parsed,setParsed]=useState<ParsedGisFile|null>(null);
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [form,setForm]=useState({projectId:projects[0]?.id??'',assetType:session.tenant?.assetTypes[0]?.name??'',layerName:'',sourceIdField:'',nameField:'name',replaceLayerId:'',color:session.tenant?.primaryColor??'#104685'});
  const duplicateIds=useMemo(()=>{
    if(!parsed||!form.sourceIdField)return 0;
    const values=parsed.featureCollection.features.map((feature)=>String(feature.properties[form.sourceIdField]??'').trim()).filter(Boolean);
    return values.length-new Set(values).size;
  },[parsed,form.sourceIdField]);
  const replacementLayers=layers.filter((layer)=>layer.projectId===form.projectId&&layer.visible);
  const previewLayer=parsed?{id:'preview',tenantId:session.user.tenantId!,projectId:form.projectId,name:form.layerName||file?.name||'Import preview',description:'Validated import preview',source:parsed.format==='Shapefile ZIP'?'Shapefile':'KML',geometryType:'Mixed',status:'Published',version:1,visible:true,style:{color:form.color,width:5,opacity:.82},featureCollection:parsed.featureCollection,createdAt:'',updatedAt:''} as GisLayer:null;

  async function choose(selected:File|null){
    if(!selected)return;
    setBusy(true);setError('');setFile(selected);
    try{const next=await parseGisFile(selected);setParsed(next);setForm((current)=>({...current,layerName:selected.name.replace(/\.(kml|kmz|zip)$/i,'').replace(/[-_]+/g,' '),sourceIdField:next.fields.find((field)=>/^(asset_?id|id|uid)$/i.test(field))??'',nameField:next.fields.find((field)=>/^(name|asset_?name|title)$/i.test(field))??''}));}
    catch(e){setParsed(null);setError(e instanceof Error?e.message:'Unable to read this GIS file.');}
    finally{setBusy(false);}
  }

  async function publish(){
    if(!parsed||!file)return;
    setBusy(true);setError('');
    try{
      const result=await post<GisImportResult>('/api/gis/imports',{projectId:form.projectId,assetType:form.assetType,layerName:form.layerName,description:`Imported from ${file.name}`,fileName:file.name,format:parsed.format,sourceIdField:form.sourceIdField||null,nameField:form.nameField||null,replaceLayerId:form.replaceLayerId||null,style:{color:form.color,width:5,opacity:.82},featureCollection:parsed.featureCollection,warnings:parsed.warnings});
      onPublished(result);
    }catch(e){setError(e instanceof Error?e.message:'Unable to publish this import.');setBusy(false);}
  }

  return <Modal title="Import KML / Shapefile assets" onClose={onClose} footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={publish} disabled={busy||!parsed||!form.projectId||!form.assetType||!form.layerName||duplicateIds>0}>{busy?'Working…':'Publish assets & layer'}</Button></>}>
    <div className="gis-import-flow">
      <div className="import-assumption"><Layers3/><div><b>Reviewable import policy</b><span>KML uses WGS84 coordinates. Shapefile ZIPs must include projection metadata. Publishing creates or updates one asset per feature and a versioned network layer.</span></div></div>
      {error&&<div className="import-error"><AlertTriangle/>{error}</div>}
      <label className="gis-file-drop"><input type="file" accept=".kml,.kmz,.zip" onChange={(event)=>choose(event.target.files?.[0]??null)}/><UploadCloud/><b>{busy&&!parsed?'Reading spatial file…':file?.name??'Choose KML, KMZ or zipped Shapefile'}</b><span>KML ≤ 10 MB · KMZ/SHP ZIP ≤ 25 MB · up to 5,000 supported features</span></label>
      {parsed&&<>
        <div className="import-stats"><span><FileArchive/><b>{parsed.format}</b></span><span><b>{parsed.featureCollection.features.length}</b> valid features</span><span><b>{parsed.geometryTypes.join(', ')}</b> geometry</span><span><b>{parsed.fields.length}</b> source fields</span></div>
        <div className="form-grid"><Field label="Project"><select value={form.projectId} onChange={(e)=>setForm({...form,projectId:e.target.value,replaceLayerId:''})}>{projects.map((project)=><option value={project.id} key={project.id}>{project.code} · {project.name}</option>)}</select></Field><Field label="Asset type"><select value={form.assetType} onChange={(e)=>setForm({...form,assetType:e.target.value})}>{session.tenant?.assetTypes.map((type)=><option key={type.id}>{type.name}</option>)}</select></Field><Field label="Published layer name"><input value={form.layerName} onChange={(e)=>setForm({...form,layerName:e.target.value})}/></Field><Field label="Replace existing layer" hint="Optional: creates a new visible version and retains the prior version for rollback."><select value={form.replaceLayerId} onChange={(e)=>setForm({...form,replaceLayerId:e.target.value})}><option value="">Create a new layer</option>{replacementLayers.map((layer)=><option value={layer.id} key={layer.id}>{layer.name} · v{layer.version}</option>)}</select></Field><Field label="Unique source ID" hint="Used to update the same asset on later imports."><select value={form.sourceIdField} onChange={(e)=>setForm({...form,sourceIdField:e.target.value})}><option value="">Deterministic geometry ID</option>{parsed.fields.map((field)=><option key={field}>{field}</option>)}</select></Field><Field label="Asset display name"><select value={form.nameField} onChange={(e)=>setForm({...form,nameField:e.target.value})}><option value="">Generate from asset type + ID</option>{parsed.fields.map((field)=><option key={field}>{field}</option>)}</select></Field><Field label="Layer colour"><input type="color" value={form.color} onChange={(e)=>setForm({...form,color:e.target.value})}/></Field></div>
        {duplicateIds>0&&<div className="import-error"><AlertTriangle/>{duplicateIds} duplicate source IDs found. Select a unique field.</div>}
        {parsed.warnings.length>0&&<div className="import-warnings"><b>Validation notes</b>{parsed.warnings.map((warning)=><span key={warning}><AlertTriangle/>{warning}</span>)}</div>}
        {previewLayer&&<div className="import-preview"><div><CheckCircle2/><b>Validated preview</b><Badge tone="success">Ready to publish</Badge></div><MapplsMap layers={[previewLayer]} assets={[]} defects={[]} projects={projects.filter((project)=>project.id===form.projectId)} compact/></div>}
        <div className="table-wrap import-sample"><table><thead><tr><th>#</th><th>Geometry</th><th>Source ID</th><th>Name</th><th>Attributes</th></tr></thead><tbody>{parsed.featureCollection.features.slice(0,5).map((feature,index)=><tr key={index}><td>{index+1}</td><td>{feature.geometry.type}</td><td>{form.sourceIdField?String(feature.properties[form.sourceIdField]??'—'):'Generated'}</td><td>{form.nameField?String(feature.properties[form.nameField]??'—'):'Generated'}</td><td>{Object.keys(feature.properties).length}</td></tr>)}</tbody></table></div>
      </>}
    </div>
  </Modal>;
}
