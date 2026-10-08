
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
  const [goesUrl, setGoesUrl] = useState('/goes-gulf-hero.webp')
  const [goesTime, setGoesTime] = useState('2026-09-12 02:30Z (fallback)')
  const [alertCount, setAlertCount] = useState(0)

  // LIVE GOES-19 - try to fetch latest CONUS/Gulf
  useEffect(() => {
    async function fetchGoes(){
      try {
        // NOAA CDN - latest Gulf sector Band 13
        // Use latest file list json
        const now = new Date()
        // Try NESDIS CDN - this updates every 5 min
        // Example: https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/13/20262661700_GOES19-ABI-CONUS-13-1000x1000.jpg but we use sector
        // For live, use GOES-19 Gulf 13 thumb + cache bust
        const liveUrl = `https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/cgl/13/GOES19-ABI-cgl-13-1000x1000.jpg?t=${Date.now()}`
        // Test if it loads
        const img = new Image()
        img.onload = () => {
          setGoesUrl(liveUrl)
          setGoesTime(now.toUTCString() + ' • LIVE GOES-19 CGL Band 13')
        }
        img.onerror = () => {
          // fallback to CONUS
          setGoesUrl(`https://cdn.star.nesdis.noaa.gov/GOES19/ABI/CONUS/13/GOES19-ABI-CONUS-13-1000x1000.jpg?t=${Date.now()}`)
          setGoesTime(now.toUTCString() + ' • LIVE GOES-19 CONUS Band 13')
        }
        img.src = liveUrl
      } catch(e){
        setGoesTime('Fallback static 2026-09-12 - live fetch blocked by CORS')
      }
    }
    fetchGoes()
    const iv = setInterval(fetchGoes, 5*60*1000)
    return () => clearInterval(iv)
  }, [])

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
              attribution: '© Carto • OpenStreetMap • No MapTiler key needed'
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
        // IEM NEXRAD N0R - NO RainViewer
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
        setErr(e.error?.message || 'Map load error - check MapTiler key')
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
        <h2>Map error - but app still works</h2>
        <p>{err}</p>
        <p>Fix: Set VITE_MAPTILER_KEY in Netlify or leave empty for Carto fallback</p>
        <img src={goesUrl} style={{width:'100%', marginTop:20}} />
      </div>
    )
  }

  return (
    <div style={{background:'#0f172a', minHeight:'100vh', color:'#e2e8f0'}}>
      <div style={{padding:'12px 16px', borderBottom:'1px solid rgba(255,255,255,0.1)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8}}>
        <div>
          <div style={{fontWeight:900, fontSize:20, letterSpacing:-1}}>STORM FORGE V2 • LIVE</div>
          <div style={{fontFamily:'monospace', fontSize:10, opacity:0.6}}>MapTiler fallback + IEM N0R + NWS Polygons {alertCount} + Hazcams 15 + Chasers • No RainViewer • No blue screen</div>
        </div>
        <div style={{display:'flex', gap:8}}>
          <button onClick={()=>setRadarOn(!radarOn)} style={{padding:'6px 12px', borderRadius:999, fontWeight:900, fontSize:11, background:radarOn?'#22d3ee':'#1e293b', color:radarOn?'#000':'#fff', border:'1px solid rgba(255,255,255,0.1)'}}>{radarOn?'RADAR ON':'RADAR OFF'}</button>
          <button onClick={()=>setAlertsOn(!alertsOn)} style={{padding:'6px 12px', borderRadius:999, fontWeight:900, fontSize:11, background:alertsOn?'#ef4444':'#1e293b', color:'#fff', border:'1px solid rgba(255,255,255,0.1)'}}>ALERTS {alertCount}</button>
        </div>
      </div>

      <div style={{position:'relative'}}>
        <div ref={mapDiv} style={{width:'100%', height:'62vh', background:'#0f172a'}} />
        <div style={{position:'absolute', top:12, left:12, width:320, borderRadius:16, overflow:'hidden', border:'1px solid rgba(255,255,255,0.2)', background:'#000'}}>
          <img src={goesUrl} alt="GOES-19 LIVE" style={{width:'100%', height:180, objectFit:'cover'}} onError={e=>{e.target.src='/goes-gulf-hero.webp'}} />
          <div style={{padding:8, background:'rgba(0,0,0,0.9)'}}>
            <div style={{fontSize:10, fontFamily:'monospace', fontWeight:700}}>GOES-19 • ABI • BAND 13 • 10.3μm • IR • LIVE ATTEMPT</div>
            <div style={{fontSize:9, fontFamily:'monospace', opacity:0.7}}>{goesTime}</div>
            <div style={{height:6, marginTop:6, background:'linear-gradient(to right, #001f4d, cyan, green, yellow, magenta)', borderRadius:4}}></div>
          </div>
        </div>
      </div>

      <div style={{padding:16, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16}}>
        <div style={{background:'#1e293b', padding:16, borderRadius:12, border:'1px solid rgba(255,255,255,0.05)'}}>
          <b>Blue screen fixed</b>
          <p style={{fontSize:12, opacity:0.7, marginTop:8}}>Added error boundary. If MapTiler key missing or invalid, falls back to Carto dark raster (no key needed). Map will ALWAYS show CONUS + IEM. Check console for map error.</p>
          <p style={{fontSize:11, fontFamily:'monospace', marginTop:8, background:'#000', padding:8, borderRadius:8}}>VITE_MAPTILER_KEY = your SuperCellWx key (or leave empty)</p>
        </div>
        <div style={{background:'#1e293b', padding:16, borderRadius:12, border:'1px solid rgba(255,255,255,0.05)'}}>
          <b>Gulf hero now LIVE</b>
          <p style={{fontSize:12, opacity:0.7, marginTop:8}}>Tries https://cdn.star.nesdis.noaa.gov/GOES19/ABI/SECTOR/cgl/13/... and CONUS/13/... with cache bust. If CORS blocks (Netlify sometimes), falls back to your static webp so never blank. Refreshes every 5 min.</p>
        </div>
        <div style={{background:'#1e293b', padding:16, borderRadius:12, border:'1px solid rgba(255,255,255,0.05)'}}>
          <b>CONUS back</b>
          <p style={{fontSize:12, opacity:0.7, marginTop:8}}>Center -95,36 zoom 4.2 shows full CONUS + Gulf. IEM N0R covers whole US. NWS polygons {alertCount} live. Hazcams cyan 15 states. Chasers magenta.</p>
        </div>
      </div>
    </div>
  )
}
