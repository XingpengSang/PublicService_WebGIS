// frontend/static/js/modules/analysis.js
// @FileDescription: 空间分析模块：服务区、盲区、居民点缓冲区


import { state } from './state.js';
import { API } from './api.js';
import { refreshMapHighlights, updatePoiListUI } from './layerManager.js';

// 清除所有分析结果
export function clearAllAnalysis() {
    state.analysisLayers.forEach(l => state.map.removeLayer(l));
    state.analysisLayers = [];
    state.drawLayer.clearLayers();
    if(state.userPoiSelection) { state.map.removeLayer(state.userPoiSelection); state.userPoiSelection=null; }
    document.getElementById('serviceResult').style.display = 'none';
    state.lastServiceGeoJSON = null;
    state.selectedIds.clear(); 
    refreshMapHighlights();
    updatePoiListUI();
}

// 激活框选模式
export function activateBoxSelect() {
    alert("请在地图上绘制一个矩形，以框选特定的设施点");
    new L.Draw.Rectangle(state.map, { shapeOptions: { color: '#333', weight: 1, dashArray: '5, 5' } }).enable();
    state.map.once(L.Draw.Event.CREATED, function(e) {
        if (state.userPoiSelection) state.map.removeLayer(state.userPoiSelection);
        state.userPoiSelection = e.layer;
        state.map.addLayer(state.userPoiSelection);
    });
}

// 获取目标 POI 坐标列表
function getTargetPois() {
    let coords = [];
    let box = state.userPoiSelection ? state.userPoiSelection.getBounds() : null;
    ['教育', '医疗', '文娱', '商业', '其他'].forEach(cat => {
        const cb = document.getElementById(`cb_${cat}`);
        if (cb && cb.checked && state.pois[cat]) {
            state.pois[cat].features.forEach(f => {
                const id = f.properties.osm_id;
                if (state.deletedIds.includes(id)) return;
                if (state.selectedIds.size > 0 && !state.selectedIds.has(id)) return;
                const lat = f.geometry.coordinates[1];
                const lng = f.geometry.coordinates[0];
                if (box) { if (box.contains([lat, lng])) coords.push([lng, lat]); } 
                else { coords.push([lng, lat]); }
            });
        }
    });
    return coords;
}

// 路网服务区分析
export async function runNetworkAnalysis() {
    // 这里的清除逻辑要小心，不要清除 POI 选中状态，否则无法分析选中点
    // 我们只清除之前的图层
    state.analysisLayers.forEach(l => state.map.removeLayer(l));
    state.analysisLayers = [];
    state.drawLayer.clearLayers();
    
    let targetPois = getTargetPois();
    if (targetPois.length === 0) { 
        if (state.selectedIds.size > 0) alert("您选中的POI点不在分析范围内！");
        else alert("请先勾选左侧类型，或者选中列表中的点！"); 
        return; 
    }

    let val = parseFloat(document.getElementById('thresholdVal').value);
    const unit = document.getElementById('thresholdUnit').value;
    let distMeters = unit === 'min' ? val * 83 : val;

    const btn = document.querySelector('button[onclick="runNetworkAnalysis()"]');
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 计算中...';

    try {
        const result = await API.analyzeService({ pois: targetPois, distance: distMeters });
        if (result.error) { alert("Error: " + result.error); return; }
        if (!result.geometry) { alert("分析结果为空"); return; }

        const layer = L.geoJSON(result.geometry, { interactive: false, style: { color: 'none', fillColor: '#8b5cf6', fillOpacity: 0.4 } }).addTo(state.map);
        state.analysisLayers.push(layer);
        state.lastServiceGeoJSON = result.geometry;
        state.map.fitBounds(layer.getBounds());

        const div = document.getElementById('serviceResult');
        div.style.display = 'block';
        div.innerHTML = `<b>结果:</b> 覆盖建筑 <b>${result.building_count}</b> 栋, 面积 <b>${result.building_area_sqm}</b> m²`;
    } catch(e) { console.error(e); }
    finally { btn.innerHTML = '<i class="fa-solid fa-spider"></i> 开始路网分析'; }
}

// 路网盲区分析
export function startBlindSpotDraw() {
    if (!state.lastServiceGeoJSON) { alert("请先执行服务区分析！"); return; }
    alert("请绘制分析区域");
    new L.Draw.Polygon(state.map).enable();
    state.map.once(L.Draw.Event.CREATED, async function(e) {
        state.drawLayer.addLayer(e.layer);
        try {
            const data = await API.analyzeBlind({ draw_geometry: e.layer.toGeoJSON().geometry, service_geometry: state.lastServiceGeoJSON });
            if (data.geometry) {
                const blindLayer = L.geoJSON(data.geometry, { interactive: false, style: { color: 'red', fillColor: 'red', fillOpacity: 0.6, weight: 1 } }).addTo(state.map);
                state.analysisLayers.push(blindLayer);
                state.drawLayer.clearLayers();
            } else { alert("无盲区"); }
        } catch(err) {}
    });
}

// 居民点缓冲区分析
export function activatePlaceSelect() {
    if (!document.getElementById('cb_places').checked) { alert("请先勾选 '显示居民点'"); return; }
    alert("点击居民点分析，悬停查看结果");
    const placesLayer = state.layers['places'];
    if (!placesLayer) return;

    placesLayer.eachLayer(layer => {
        layer.off('click'); layer.off('mouseover');
        const props = layer.feature.properties; const id = props.osm_id;
        
        layer.on('click', async (e) => {
            let dist = parseFloat(document.getElementById('placeBufferDist').value) || 1000;
            if (state.placeAnalyses[id]) {
                state.map.removeLayer(state.placeAnalyses[id].layer);
                delete state.placeAnalyses[id];
                layer.unbindTooltip(); layer.bindTooltip(props.name, {direction:'top', offset:[0,-5]});
                return;
            }
            layer.bindTooltip("分析中...", {permanent:true}).openTooltip();
            try {
                const data = await API.analyzePlaceBuffer({coord:[e.latlng.lng, e.latlng.lat], distance:dist});
                const circle = L.geoJSON(data.geometry, {interactive:false, style:{color:'#10b981', fillColor:'#10b981', fillOpacity:0.2}}).addTo(state.map);
                
                let html = `<b>${props.name}</b> (${dist}m)<hr style="margin:2px 0">`;
                html += data.is_complete ? `<b style="color:green">✔ 完善</b>` : `<b style="color:red">✘ 缺: ${data.missing_types.join(',')}</b>`;
                
                state.placeAnalyses[id] = { layer: circle, info: html };
                layer.unbindTooltip(); 
                layer.bindTooltip(html, {permanent:false, direction:'top', className:'place-tooltip'}).openTooltip();
            } catch(err) { layer.bindTooltip("Error"); }
        });
    });
}