import React, { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY || ''

export default function App(){
  const mapRef = useRef(null)
  const mapDiv = useRef(null)
  const [err, setErr] = useState(null)
  const [radarOn, setRadarOn] = useState(true)
  const [alertsOn, setAlertsOn] = useState(true)
  const [alertCount, setAlertCount] = useState(0)

  useEffect(() => {
    try {
      if (mapRef.current) return
      if (!mapDiv.current) return

      const style = MAPTILER_KEY ? 
        `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}` :
        {
          version: 8,
          sources: {
            'carto-dark': {
              type: 'raster',
              tiles: ['https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'],
              tileSize: 256,
              attribution: '© Carto • OpenStreetMap'
            }
          },
          layers: [{id:'carto-dark', type:'raster', source:'carto-dark'}]
        }

      const map = new maplibregl.Map({
        container: mapDiv.current,
        style: style,
        center: [-95, 36],
        zoom: 4.2
      })
      mapRef.current = map

      map.on('load', async () => {
        // IEM NEXRAD N0R
        map.addSource('iem', {
          type:'raster',
          tiles:['https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0/nexrad-n0r-900913/{z}/{x}/{y}.png'],
          tileSize:256
        })
        map.addLayer({id:'iem-radar', type:'raster', source:'iem', paint:{'raster-opacity':0.85}})

        // NWS Alerts LIVE polygons
        try {
          const r = await fetch('https://api.weather.gov/alerts/active?status=actual&message_type=alert')
          const j = await r.json()
          const feats = j.features.filter(f=>f.geometry).map(f=>({
            type:'Feature',
            geometry:f.geometry,
            properties:{event:f.properties.event, headline:f.properties.headline, color: f.properties.event.includes('Tornado') ? '#ff0000' : f.properties.event.includes('Severe') ? '#ff8c00' : '#ffff00'}
          }))
          setAlertCount(feats.length)
          map.addSource('alerts',{type:'geojson', data:{type:'FeatureCollection', features:feats}})
          map.addLayer({id:'alerts-fill', type:'fill', source:'alerts', paint:{'fill-color':['get','color'], 'fill-opacity':0.25}})
          map.addLayer({id:'alerts-line', type:'line', source:'alerts', paint:{'line-color':['get','color'], 'line-width':2}})
        } catch(e){ console.log('NWS fail', e); setAlertCount(0) }

        // Hazcams - 15 nationwide
        const cams = [
          {lon:-77.5, lat:34.9, name:'I-40 Richlands NC'},
          {lon:-87.2, lat:30.4, name:'I-10 Pensacola FL'},
          {lon:-91.6, lat:30.3, name:'I-10 Atchafalaya LA'},
          {lon:-95.6, lat:29.78, name:'I-10 Houston TX'},
          {lon:-97.48, lat:35.33, name:'I-35 Moore OK'},
          {lon:-99.32, lat:38.87, name:'I-70 Hays KS'},
          {lon:-105.9, lat:39.68, name:'I-70 Eisenhower CO'},
          {lon:-105.6, lat:41.3, name:'I-80 Laramie WY'},
          {lon:-99.08, lat:40.7, name:'I-80 Kearney NE'},
          {lon:-93.62, lat:41.58, name:'I-80 Des Moines IA'},
          {lon:-89.64, lat:39.78, name:'I-55 Springfield IL'},
          {lon:-86.15, lat:39.76, name:'I-65 Indianapolis IN'},
          {lon:-88.03, lat:30.69, name:'I-65 Mobile AL'},
          {lon:-84.38, lat:33.74, name:'I-75 Atlanta GA'},
          {lon:-86.78, lat:36.16, name:'I-40 Nashville TN'},
        ]
        const camFeats = cams.map(c=>({type:'Feature', geometry:{type:'Point', coordinates:[c.lon, c.lat]}, properties:c}))
        map.addSource('hazcams',{type:'geojson', data:{type:'FeatureCollection', features:camFeats}})
        map.addLayer({id:'hazcams', type:'circle', source:'hazcams', paint:{'circle-radius':6, 'circle-color':'#00ffff', 'circle-stroke-width':2, 'circle-stroke-color':'#000'}})

        // Chasers
        const chasers = [
          {lon:-77.54, lat:34.9, name:'EddieTina Home'},
          {lon:-97.92, lat:35.46, name:'StormScan OK'},
          {lon:-89.8, lat:30.12, name:'Gulf Intercept'},
          {lon:-98.45, lat:38.12, name:'Plains Tracker'},
        ].map(c=>({type:'Feature', geometry:{type:'Point', coordinates:[c.lon, c.lat]}, properties:c}))
        map.addSource('chasers',{type:'geojson', data:{type:'FeatureCollection', features:chasers}})
        map.addLayer({id:'chasers', type:'circle', source:'chasers', paint:{'circle-radius':7, 'circle-color':'#ff00ff', 'circle-stroke-color':'#fff', 'circle-stroke-width':2}})

        map.setMaxZoom(18)
      })

      map.on('error', (e) => {
        console.error('Map error', e)
        setErr(e.error?.message || 'Map load error')
      })

    } catch(e){
      console.error(e)
      setErr(e.message)
    }
  }, [])

  useEffect(() => {
    const m = mapRef.current
    if (!m?.getLayer('iem-radar')) return
    m.setLayoutProperty('iem-radar','visibility', radarOn?'visible':'none')
    if (m.getLayer('alerts-fill')) {
      m.setLayoutProperty('alerts-fill','visibility', alertsOn?'visible':'none')
      m.setLayoutProperty('alerts-line','visibility', alertsOn?'visible':'none')
    }
  }, [radarOn, alertsOn])

  if (err) {
    return (
      <div style={{background:'#0f172a', color:'white', padding:20}}>
        <h2>Map error</h2>
        <p>{err}</p>
      </div>
    )
  }

  return (
    <div style={{background:'#0f172a', minHeight:'100vh', color:'#e2e8f0', display:'flex', flexDirection:'column'}}>
      <div style={{padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.1)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8}}>
        <div>
          <div style={{fontWeight:900, fontSize:20, letterSpacing:-1}}>STORM FORGE V2 • LIVE</div>
          <div style={{fontFamily:'monospace', fontSize:10, opacity:0.6}}>IEM N0R + NWS Polygons {alertCount} + Hazcams 15 + Chasers</div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button onClick={()=>setRadarOn(!radarOn)} style={{padding:'6px 12px', borderRadius:999, fontWeight:900, fontSize:11, background:radarOn?'#22d3ee':'#1e293b', color:radarOn?'#000':'#fff', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer'}}>{radarOn?'RADAR ON':'RADAR OFF'}</button>
          <button onClick={()=>setAlertsOn(!alertsOn)} style={{padding:'6px 12px', borderRadius:999, fontWeight:900, fontSize:11, background:alertsOn?'#ef4444':'#1e293b', color:'#fff', border:'1px solid rgba(255,255,255,0.1)', cursor:'pointer'}}>ALERTS {alertCount}</button>
        </div>
      </div>

      <div style={{flex:1, position:'relative'}}>
        <div ref={mapDiv} style={{width:'100%', height:'calc(100vh - 58px)', background:'#0f172a'}} />
      </div>
    </div>
  )
}
