// frontend/static/js/modules/exporter.js
// @FileDescription: 统计导出模块：截图、图表统计


import { state } from './state.js';
import { API } from './api.js';

let currentChartData = null; // 用于导出当前图表数据

// 导出当前地图为图片
export function exportMapImage() {
    const mapNode = document.getElementById('map');
    const btn = document.querySelector('button[onclick="exportMapImage()"]');
    const oldText = btn.innerHTML;
    btn.innerHTML = '生成中...'; btn.disabled = true;
    const controls = document.querySelectorAll('.leaflet-control-container, .mouse-coords-box');
    controls.forEach(c => c.style.display = 'none');

    domtoimage.toPng(mapNode, { width: mapNode.clientWidth, height: mapNode.clientHeight, quality:0.95 })
    .then(function (dataUrl) {
        const link = document.createElement('a');
        link.download = 'map-export.png'; link.href = dataUrl; link.click();
        controls.forEach(c => c.style.display = ''); btn.innerHTML = oldText; btn.disabled = false;
    })
    .catch(function (error) {
        alert("导出失败"); controls.forEach(c => c.style.display = ''); btn.innerHTML = oldText; btn.disabled = false;
    });
}

// 打开图表模态框
function openChartModal(title) {
    document.getElementById('chartModal').style.display = 'flex';
    document.getElementById('chartTitle').innerText = title;
    echarts.dispose(document.getElementById('echartsContainer'));
}

// 显示 POI 统计图表
export function showPoiStats() {
    const stats = { '教育':0, '医疗':0, '文娱':0, '商业':0, '其他':0 };
    Object.keys(state.pois).forEach(cat => {
        if (state.pois[cat]) {
            const count = state.pois[cat].features.filter(f => !state.deletedIds.includes(f.properties.osm_id)).length;
            if (stats[cat]!==undefined) stats[cat] += count;
        }
    });
    const total = Object.values(stats).reduce((a,b)=>a+b, 0);
    if (total === 0) { alert("无数据"); return; }

    const chartData = Object.keys(stats).map(k => ({ value: stats[k], name: k }));
    currentChartData = {
        title: "POI统计", headers: ["类型", "数量", "占比"],
        rows: chartData.map(d => [d.name, d.value, ((d.value/total)*100).toFixed(1)+'%'])
    };

    openChartModal("POI 设施数量统计");
    const chart = echarts.init(document.getElementById('echartsContainer'));
    chart.setOption({
        tooltip: { trigger:'item' }, legend: { top:'5%' },
        series: [{ type:'pie', radius:['40%','70%'], data:chartData, color:['#3b82f6','#ef4444','#ec4899','#f59e0b','#6b7280'] }]
    });
}

// 显示居民点服务完善度统计图表
export async function showPlaceStats() {
    const dist = document.getElementById('statsBufferDist').value;
    const btn = document.querySelector('button[onclick="showPlaceStats()"]');
    const oldText = btn.innerHTML; btn.innerHTML='计算中...'; btn.disabled=true;

    try {
        const data = await API.getPlaceStats({ distance: dist });
        const cats = Object.keys(data);
        if (cats.length === 0) { alert("无数据"); return; }
        
        const complete = cats.map(k => data[k].complete);
        const missing = cats.map(k => data[k].missing);
        currentChartData = {
            title: `居民点完善度 (${dist}m)`, headers: ["类型", "完善", "缺失", "总计"],
            rows: cats.map((k, i) => [k, complete[i], missing[i], complete[i]+missing[i]])
        };

        openChartModal("居民点服务完善度");
        const chart = echarts.init(document.getElementById('echartsContainer'));
        chart.setOption({
            tooltip: { trigger:'axis' }, legend: { top:'5%' }, xAxis: { type:'category', data:cats }, yAxis: { type:'value' },
            series: [
                { name:'完善', type:'bar', stack:'t', data:complete, itemStyle:{color:'#10b981'} },
                { name:'缺失', type:'bar', stack:'t', data:missing, itemStyle:{color:'#ef4444'} }
            ]
        });
    } catch(e) {} finally { btn.innerHTML=oldText; btn.disabled=false; }
}

// 导出当前图表数据为 CSV
export function exportCurrentChartData() {
    if (!currentChartData) return;
    let csv = "\uFEFF" + currentChartData.headers.join(",") + "\n";
    currentChartData.rows.forEach(r => csv += r.join(",") + "\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    link.download = `${currentChartData.title}.csv`;
    link.click();
}