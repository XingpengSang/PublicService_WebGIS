// frontend/static/js/modules/editor.js
// @FileDescription: 编辑器模块：增删改查、属性表单、几何绘制


import { state } from './state.js';
import { API } from './api.js';
import { toggleCategory, toggleLayer } from './layerManager.js';

// 设置编辑模式
export function setEditMode(mode) {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    if (state.editMode.mode === mode) {
        state.editMode.mode = 'none';
        document.getElementById('editModeTip').style.display = 'none';
        state.map.getContainer().style.cursor = '';
    } else {
        state.editMode.mode = mode;
        const btnId = mode === 'info' ? 'btnToolInfo' : (mode === 'edit' ? 'btnToolEdit' : '');
        if(btnId) document.getElementById(btnId).classList.add('active');
        document.getElementById('editModeTip').style.display = 'block';
        document.getElementById('editModeTip').innerText = mode === 'info' ? '模式: 查看 (点击要素)' : '模式: 编辑 (点击要素)';
        state.map.getContainer().style.cursor = 'crosshair';
    }
    if (state.editMode.tempDrawLayer) { state.drawLayer.removeLayer(state.editMode.tempDrawLayer); state.editMode.tempDrawLayer = null; }
}

// 打开/关闭新增要素模态框
export function openAddModal() { document.getElementById('layerSelectModal').style.display = 'flex'; }
export function closeLayerModal() { document.getElementById('layerSelectModal').style.display = 'none'; }

// 开始绘制新要素
export function startDrawNew(layerType, geomType) {
    closeLayerModal();
    state.editMode.mode = 'add';
    state.editMode.targetLayerType = layerType;
    document.getElementById('editModeTip').style.display = 'block';
    document.getElementById('editModeTip').innerText = `正在新增: ${layerType}`;
    document.getElementById('btnToolAdd').classList.add('active');
    
    let drawer;
    if (geomType === 'Point') drawer = new L.Draw.Marker(state.map);
    else if (geomType === 'LineString') drawer = new L.Draw.Polyline(state.map);
    else if (geomType === 'Polygon') drawer = new L.Draw.Polygon(state.map);
    drawer.enable();
    
    state.map.once(L.Draw.Event.CREATED, function(e) {
        state.editMode.tempDrawLayer = e.layer;
        state.drawLayer.addLayer(e.layer);
        openFeatureForm(null, layerType);
    });
}

// 打开属性表单模态框
export function openFeatureForm(feature, layerType) {
    const modal = document.getElementById('featureFormModal');
    const container = document.getElementById('formContainer');
    const footer = document.getElementById('formFooter');
    const geomSection = document.getElementById('geomEditSection');
    container.innerHTML = ""; modal.style.display = 'flex';
    
    let props = {};
    if (feature) {
        props = JSON.parse(JSON.stringify(feature.properties)); 
        document.getElementById('formTitle').innerText = state.editMode.mode === 'info' ? "查看属性" : "编辑属性";
        state.editMode.editingFeatureId = props.osm_id;
        state.editMode.targetLayerType = layerType;
    } else {
        document.getElementById('formTitle').innerText = "新增要素";
        props = { name: "", fclass: "" }; 
        state.editMode.editingFeatureId = null;
    }

    const commonFields = ['osm_id', 'fclass', 'name', 'code'];
    const allKeys = new Set([...commonFields, ...Object.keys(props)]);
    const sortedKeys = Array.from(allKeys).sort((a, b) => {
        const idxA = commonFields.indexOf(a); const idxB = commonFields.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1; if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });

    sortedKeys.forEach(key => { if (key !== 'geometry') renderInputRow(container, key, props[key]); });

    if (state.editMode.mode === 'info') {
        container.querySelectorAll('input').forEach(i => { i.disabled = true; i.style.border = 'none'; i.style.background = 'transparent'; });
        footer.style.display = 'none'; geomSection.style.display = 'none';
    } else {
        footer.style.display = 'block'; geomSection.style.display = (state.editMode.mode === 'edit') ? 'block' : 'none';
        const idInput = container.querySelector('input[data-key="osm_id"]');
        if(idInput) { idInput.disabled = true; idInput.style.background = '#f3f4f6'; }
    }
}

// 渲染单行输入框
function renderInputRow(container, key, value) {
    const div = document.createElement('div'); div.className = 'form-row';
    div.innerHTML = `<label style="font-weight:bold; color:#444;">${key}</label><input type="text" data-key="${key}" value="${(value===null||value===undefined)?"":value}" autocomplete="off">`;
    container.appendChild(div);
}

// 关闭属性表单模态框
export function closeFormModal() {
    document.getElementById('featureFormModal').style.display = 'none';
    if (state.editMode.mode === 'add' && state.editMode.tempDrawLayer) { state.drawLayer.removeLayer(state.editMode.tempDrawLayer); state.editMode.tempDrawLayer = null; }
    if (state.editMode.mode === 'edit' && state.editMode.tempDrawLayer) { state.drawLayer.removeLayer(state.editMode.tempDrawLayer); state.editMode.tempDrawLayer = null; state.editMode.editingFeatureGeom = null; }
}

// 提交属性表单
export async function submitFeatureForm() {
    const inputs = document.querySelectorAll('#formContainer input');
    const newProps = {};
    inputs.forEach(input => newProps[input.getAttribute('data-key')] = input.value);

    const url = state.editMode.mode === 'add' ? '/api/feature/add' : '/api/feature/update';
    const body = { layer_type: state.editMode.targetLayerType, properties: newProps };

    if (state.editMode.mode === 'add') {
        body.feature = { type: "Feature", properties: newProps, geometry: state.editMode.tempDrawLayer.toGeoJSON().geometry };
    } else {
        body.id = state.editMode.editingFeatureId;
        if (state.editMode.editingFeatureGeom) body.geometry = state.editMode.editingFeatureGeom;
    }

    try {
        const result = await (state.editMode.mode==='add' ? API.addFeature(body) : API.updateFeature(body));
        if (result.status === 'success') {
            alert("保存成功！"); closeFormModal();
            if (state.editMode.targetLayerType === 'pois') {
                ['教育','医疗','文娱','商业','其他'].forEach(c => { if(document.getElementById(`cb_${c}`)?.checked) toggleCategory(c); });
            } else if (state.editMode.targetLayerType === 'roads') {
                document.querySelectorAll('.road-checkbox:checked').forEach(cb => { cb.checked = false; cb.click(); });
            } else { toggleLayer(state.editMode.targetLayerType); }
            
            if(state.editMode.tempDrawLayer) state.drawLayer.removeLayer(state.editMode.tempDrawLayer);
            setEditMode('none');
        } else alert("保存失败");
    } catch(e) { alert("Error"); }
}

// 重新绘制几何形状
export function redrawGeometry() {
    document.getElementById('featureFormModal').style.display = 'none';
    alert("请在地图上绘制新的形状");
    let geomType = 'Point';
    if (state.editMode.targetLayerType === 'roads') geomType = 'LineString';
    else if (state.editMode.targetLayerType === 'buildings') geomType = 'Polygon';
    
    let drawer;
    if (geomType === 'Point') drawer = new L.Draw.Marker(state.map);
    else if (geomType === 'LineString') drawer = new L.Draw.Polyline(state.map);
    else if (geomType === 'Polygon') drawer = new L.Draw.Polygon(state.map);
    drawer.enable();
    
    state.map.once(L.Draw.Event.CREATED, function(e) {
        state.editMode.tempDrawLayer = e.layer;
        state.drawLayer.addLayer(e.layer);
        state.editMode.editingFeatureGeom = e.layer.toGeoJSON().geometry;
        document.getElementById('featureFormModal').style.display = 'flex';
    });
}