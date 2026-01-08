
# 城市公共设施服务覆盖分析系统 (Urban Public Facilities Service Coverage Analysis System)

![Project Status](https://img.shields.io/badge/Status-Completed-success)
![Python](https://img.shields.io/badge/Python-3.9+-blue)
![Flask](https://img.shields.io/badge/Flask-3.0-green)
![Leaflet](https://img.shields.io/badge/Leaflet-1.9-orange)

> 基于 WebGIS 技术的城市公共服务设施布局评价与可视化分析工具。

## 📖 项目简介

本项目是一个 B/S 架构的 WebGIS 系统，旨在辅助规划部门及研究人员评估城市公共服务设施（教育、医疗、文娱、商业等）的空间分布及其服务覆盖情况。系统支持多源数据导入、基于路网的服务区分析、覆盖盲区计算以及居民点服务完善度评价，并提供图表与地图的导出功能。

## ✨ 核心功能

### 1. 数据管理与可视化
*   **多源数据加载**：支持 POI（设施点）、路网、居民点、建筑物的 GeoJSON 数据展示。
*   **分级分类显示**：
    *   POI：支持按“教育、医疗、文娱、商业、其他”五大类筛选显示，采用不同颜色聚类展示。
    *   路网：支持按“高速公路、干线公路、主要道路、次要道路、居民区道路、其他”六级显示，采用不同颜色与粗细渲染。
*   **交互式编辑**：
    *   支持在线**新增、修改、删除**点/线/面要素。
    *   支持**查看与编辑**要素的所有属性字段（自动排序，重要字段置顶）。
    *   支持**几何形状重绘**，利用`Leaflet.Draw`，支持对现有要素进行几何重绘。
*   **自定义数据导入**：用户可上传自己的 GeoJSON 数据集覆盖默认示例数据，并支持一键重置回默认状态。

### 2. 高级空间分析
*   **服务区分析 (Service Area)**：
    *   **逻辑**：基于路网几何进行缓冲区模拟（非简单欧氏距离圆），生成沿路网分布的服务范围面。
    *   **交互**：支持按类型筛选或**手动框选**特定 POI 进行分析。
    *   **统计**：自动计算服务区覆盖的建筑物数量及总面积
*   **覆盖盲区分析 (Blind Spot)**：
    *   支持用户手绘任意多边形作为分析区域。
    *   自动计算分析区域与服务区的**几何差集**，高亮显示服务盲区。
*   **居民点完善度评价**：
    *   **交互**：点击任意居民点即可生成指定半径（如 1000米）的缓冲区。
    *   **评价**：自动判断该范围内缺失的设施类型（如“缺医疗”），并以 Tooltip 形式悬停展示。    

### 3. 结果输出与统计
*   **统计图表**：
    *   集成 **ECharts**，支持生成 POI 数量占比饼图。
    *   支持批量计算所有居民点的服务完善度，生成堆叠柱状图（完善 vs 缺失）。
    *   支持图表数据导出为 **CSV** 表格。
*   **地图导出**：
    *   集成 `dom-to-image`，支持将当前地图视图（含分析结果）一键导出为 **PNG** 图片。

## 🛠️ 技术栈

| 模块 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **前端** | HTML5, CSS3, ES6 Modules | 采用原生模块化开发 |
| **地图引擎** | **Leaflet.js** | 轻量级二维地图渲染 |
| **空间分析** | **Turf.js** | 前端轻量级几何计算 |
| **可视化** | **ECharts** | 交互式统计图表 |
| **工具库** | Leaflet.Draw, dom-to-image | 绘图与截图支持 |
| **后端** | **Python Flask** | 轻量级 Web 服务框架 |
| **几何引擎** | **Shapely** | 后端复杂空间运算 (交集/差集/面积) |
| **数据格式** | **GeoJSON** | 前后端统一数据交换格式 |

## 🚀 快速开始

### 1. 环境准备
确保本地已安装 Python 3.8+。

### 2. 克隆项目
```bash
git clone <本仓库地址>
cd PublicService_WebGIS
```

### 3. 安装依赖
建议创建虚拟环境以保持环境纯净。
```bash
# Windows
python -m venv venv
.\venv\Scripts\activate

# Mac/Linux
python3 -m venv venv
source venv/bin/activate

# 安装依赖包 (Flask, Shapely, Flask-Cors)
pip install -r requirements.txt
```

### 4. 启动服务
```bash
python backend/app.py
```
终端显示 `Running on http://127.0.0.1:5000` 即表示启动成功。

### 5. 访问系统
打开浏览器（推荐 Chrome 或 Edge）访问：http://127.0.0.1:5000

📂 项目目录结构
```text
PublicService_WebGIS/
├── backend/
│   ├── app.py                # Flask 后端入口与 API 逻辑
│   ├── requirements.txt      # Python 依赖清单
│   └── venv/                 # 虚拟环境 (不提交)
├── data/                     # 存放 GeoJSON 数据源与配置文件
│   ├── classification.txt    # 设施类型映射配置
│   └── *.geojson             # 新增示例数据 (不提交)
├── frontend/
│   ├── static/
│   │   ├── css/              # 样式文件
│   │   ├── js/
│   │   │   ├── modules/      # JS 模块 (核心逻辑拆分)
│   │   │   │   ├── analysis.js     # 空间分析
│   │   │   │   ├── api.js          # 接口封装
│   │   │   │   ├── editor.js       # 编辑器逻辑
│   │   │   │   ├── exporter.js     # 导出逻辑
│   │   │   │   ├── layerManager.js # 图层控制
│   │   │   │   ├── state.js        # 全局状态
│   │   │   │   └── ui.js           # 界面交互
│   │   │   ├── main.js       # 前端入口
│   │   │   └── map.js        # 地图配置
│   │   ├── lib               # 离线库 (没用上，不提交)
│   │   └── favicon.ico       # 网页图标
│   └── templates/
│       └── index.html        # 主页结构
└── README.md                 # 项目说明文档
```

## 📝 操作指南

### 1. 数据管理
*   在左侧面板勾选不同类型的 POI 或路网进行加载。
*   点击列表中的行可高亮地图点（支持 Shift/Ctrl 多选）。
*   支持使用示例数据或用户自行上传数据。

### 2. 空间分析
*   切换到 “空间分析” 标签页。
*   点击 “框选 POI”，在地图上画框选择要分析的设施点（支持结合左侧筛选）。
*   输入距离阈值（如 1000米），点击 “开始路网分析”。
*   分析完成后，点击 “绘制区域并分析盲区”，手绘多边形查看覆盖盲区。

### 3. 数据编辑
*   点击地图右上角的 + (新增) 或 ✎ (修改) 按钮。
*   点击地图上的要素，弹出属性编辑框。
*   修改属性或点击 “重绘几何” 修改形状，保存后即时生效。

### 4. 导出结果
切换到 “结果输出” 标签页，可导出高清地图截图或统计报表。