/* Web pública de las ligas: clasificaciones, resultados y goleadores a partir de data/liga.json */
(function () {
  'use strict';
  const L = LigaCore;
  const $ = (s, r = document) => r.querySelector(s);

  function el(tag, attrs, ...hijos) {
    const [nombre, ...resto] = tag.split(/(?=[.#])/);
    const n = document.createElement(nombre || 'div');
    resto.forEach((p) => (p[0] === '.' ? n.classList.add(p.slice(1)) : (n.id = p.slice(1))));
    if (attrs !== null && attrs !== undefined && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
      hijos.unshift(attrs);
      attrs = null;
    }
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    }
    hijos.flat(Infinity).forEach((h) => h !== null && h !== undefined && h !== false && n.append(h instanceof Node ? h : document.createTextNode(String(h))));
    return n;
  }

  const DATOS = document.documentElement.dataset.datos || '../data/liga.json';
  const S = { liga: null, torneo: null, sec: 'clasificacion', jornada: {}, filtroGol: {}, cargado: 0 };
  const SECCIONES = ['clasificacion', 'calendario', 'goleadores'];
  const lsGet = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch {} };

  /* ---------- Formato ---------- */
  const fecha = (iso, opts) => {
    if (!iso) return '';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('es-ES', opts);
  };
  const diaLargo = (iso) => (iso ? fecha(iso, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Fecha por determinar');
  const diaCorto = (iso) => fecha(iso, { day: '2-digit', month: 'short' }).replace('.', '');
  const hoyIso = () => new Date().toISOString().slice(0, 10);

  const torneo = () => S.liga.torneos.find((t) => t.id === S.torneo) || S.liga.torneos[0];
  const nombreEq = (t, id, corto) => {
    const e = id && L.equipo(t, id);
    return e ? (corto ? e.corto || e.nombre : e.nombre) : 'Por determinar';
  };
  const grupoDe = (t, comp) => (t.grupos.length > 1 ? (t.grupos.find((g) => g.id === comp) || { nombre: comp === 'fs2f' ? 'Fase final' : '' }).nombre : '');

  /* ---------- Carga de datos ---------- */
  async function cargar(forzar) {
    const btn = $('#recargar');
    btn.classList.add('girando');
    try {
      const r = await fetch(DATOS + '?t=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const nueva = await r.json();
      const cambio = !S.liga || nueva.actualizado !== S.liga.actualizado;
      S.liga = nueva;
      S.cargado = Date.now();
      if (!cambio && !forzar) return;
    } catch {
      if (!S.liga) {
        $('#vista').replaceChildren(el('div.tarjeta', el('div.vacio', el('b', 'No se han podido cargar los datos'), 'Comprueba la conexión y vuelve a intentarlo.')));
        return;
      }
    } finally {
      btn.classList.remove('girando');
    }
    $('#temporada').textContent = 'Temporada ' + (S.liga.temporada || '').replace('-', '/') + ' · FEDC';
    leerRuta();
    pintar();
  }

  /* ---------- Rutas: #torneo/seccion ---------- */
  /* Rutas: '' = menú de competiciones · #torneo/seccion = dentro de una competición */
  function leerRuta() {
    let [t, s] = location.hash.replace(/^#\/?/, '').split('/');
    if (s === 'resultados') s = 'calendario'; // enlaces antiguos
    S.torneo = S.liga.torneos.some((x) => x.id === t) ? t : null;
    S.sec = SECCIONES.includes(s) ? s : 'clasificacion';
  }
  function ir(t, s) {
    const destino = t ? `#${t}/${s || 'clasificacion'}` : '';
    if (location.hash !== destino) history.pushState(null, '', t ? destino : location.pathname + location.search);
    S.torneo = t;
    S.sec = s || 'clasificacion';
    pintar();
    window.scrollTo({ top: 0 });
  }
  window.addEventListener('popstate', () => S.liga && (leerRuta(), pintar()));

  /* ---------- Pintado general ---------- */
  function pintar() {
    const enInicio = !S.torneo;
    document.body.classList.toggle('en-inicio', enInicio);
    $('#volver').hidden = enInicio;
    if (enInicio) {
      $('#titulo').textContent = 'Ligas nacionales';
      document.title = 'Ligas nacionales · FEDC';
      const v = $('#vista');
      v.replaceChildren();
      vistaInicio(v);
      return;
    }
    const t = torneo();
    $('#titulo').textContent = t.corto;
    document.querySelectorAll('.barra-inf a').forEach((a) => {
      a.href = `#${t.id}/${a.dataset.sec}`;
      if (a.dataset.sec === S.sec) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const titulos = { clasificacion: 'Clasificación', calendario: 'Calendario', goleadores: 'Goleadores' };
    document.title = `${titulos[S.sec]} · ${t.corto} · Ligas FEDC`;
    const v = $('#vista');
    v.replaceChildren();
    if (LOGOS[t.id]) v.append(el('div.banner-torneo', el('img', { src: LOGOS[t.id], alt: 'Logotipo ' + t.nombre, width: 480, height: 245 })));
    ({ clasificacion: vistaClasificacion, calendario: vistaResultados, goleadores: vistaGoleadores })[S.sec](v, t);
    v.append(el('div.pie-datos', 'Datos de las actas oficiales · Actualizado ' + new Date(S.liga.actualizado).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })));
  }
  document.querySelectorAll('.barra-inf a').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      ir(S.torneo, a.dataset.sec);
    })
  );

  /* ---------- Menú de competiciones ---------- */
  const ICONOS = {
    f5: '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="17" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 15.5l7.6 5.5-2.9 8.9h-9.4l-2.9-8.9z" fill="currentColor"/><path d="M24 15.5V7.5M31.6 21l7.4-2.6M28.7 29.9l4.7 6.6M19.3 29.9l-4.7 6.6M16.4 21L9 18.4" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
    fs: '<svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="10" width="38" height="28" rx="3" fill="none" stroke="currentColor" stroke-width="3"/><path d="M24 10v28" stroke="currentColor" stroke-width="2.4"/><circle cx="24" cy="24" r="5.5" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M5 18h5v12H5M43 18h-5v12h5" fill="none" stroke="currentColor" stroke-width="2.4"/></svg>',
  };

  const LOGOS = { f5: 'logo-f5.png', fs1: 'logo-fs1.png', fs2: 'logo-fs2.png' };

  function resumenTorneo(t) {
    const todos = L.partidos(t);
    const jugados = todos.filter((p) => L.jugado(S.liga.resultados[p.id])).length;
    const proximo = todos.filter((p) => !S.liga.resultados[p.id] && (p.fecha || '9999') >= hoyIso()).sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))[0];
    const lideres = jugados && (t.grupos.length === 1 || CLASIF_UNICA[t.id]) ? L.clasificacion(S.liga, t, '*')[0] : null;
    const datos = [t.equipos.length + ' equipos', t.grupos.length > 1 ? t.grupos.map((g) => g.nombre).join(' y ') + ' · fase final' : t.jornadas.length + ' jornadas'];
    const estado = jugados
      ? (lideres ? 'Líder: ' + lideres.corto + ' · ' : '') + jugados + ' de ' + todos.length + ' partidos jugados'
      : proximo
      ? 'Comienza el ' + diaLargo(proximo.fecha)
      : 'Temporada ' + (S.liga.temporada || '').replace('-', '/');
    return { datos: datos.join(' · '), estado };
  }

  function vistaInicio(v) {
    v.append(
      el('h1.inicio-titulo', 'Elige una competición'),
      el(
        'nav.menu-torneos',
        { 'aria-label': 'Competiciones' },
        S.liga.torneos.map((t) => {
          const r = resumenTorneo(t);
          const icono = LOGOS[t.id]
            ? el('span.menu-logo', el('img', { src: LOGOS[t.id], alt: 'Logotipo ' + t.nombre, width: 480, height: 245, loading: 'eager' }))
            : el('span.menu-icono');
          if (!LOGOS[t.id]) icono.innerHTML = ICONOS[t.modalidad === 'f5' ? 'f5' : 'fs'];
          return el(
            'a.menu-torneo',
            { href: `#${t.id}/clasificacion`, onclick: (e) => (e.preventDefault(), ir(t.id, 'clasificacion')) },
            icono,
            el('span.menu-texto', el('b', t.corto), LOGOS[t.id] ? null : el('span.menu-nombre', t.nombre), el('span.menu-datos', r.datos), el('span.menu-estado', r.estado)),
            el('span.menu-flecha', { 'aria-hidden': 'true' }, '›')
          );
        })
      ),
      el('div.pie-datos', 'Datos de las actas oficiales · Actualizado ' + new Date(S.liga.actualizado).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))
    );
  }

  /* ---------- Clasificación ---------- */
  /* Zonas de la clasificación (colores de la posición) */
  const ZONAS = {
    f5: [{ desde: 1, hasta: 4, clase: 'z-verde', texto: 'Clasifican para el Campeonato de España' }],
    fs1: [
      { desde: 1, hasta: 4, clase: 'z-verde', texto: 'Clasifican para el Campeonato de España' },
      { desde: 7, hasta: 7, clase: 'z-naranja', texto: 'Juega el play-off' },
      { desde: 8, hasta: 8, clase: 'z-rojo', texto: 'Desciende a 2ª División' },
    ],
    fs2: [
      { desde: 1, hasta: 4, clase: 'z-verde-claro', texto: 'Fase eliminatoria como cabeza de serie' },
      { desde: 5, hasta: 8, clase: 'z-verde-oscuro', texto: 'Fase eliminatoria' },
    ],
  };
  // Competiciones con grupos que se ordenan en una única clasificación general
  const CLASIF_UNICA = { fs2: true };
  const gruposClasif = (t) => (CLASIF_UNICA[t.id] || t.grupos.length === 1 ? [{ id: '*', nombre: 'Clasificación general' }] : t.grupos);
  const zonaDe = (t, pos) => (ZONAS[t.id] || []).find((z) => pos >= z.desde && pos <= z.hasta);
  const nombreGrupo = (t, id) => ((t.grupos.find((g) => g.id === id) || {}).nombre || '').replace('Grupo ', '');

  function vistaClasificacion(v, t) {
    const conGrupos = t.grupos.length > 1;
    const unica = !!CLASIF_UNICA[t.id] && conGrupos;
    gruposClasif(t).forEach((g) => {
      const filas = L.clasificacion(S.liga, t, g.id);
      const jugados = filas.some((f) => f.pj > 0);
      const tarjeta = el('section.tarjeta', { 'aria-labelledby': 'cl-' + (g.id === '*' ? 'general' : g.id) });
      const ver = el('button.ver-mas', { type: 'button', 'aria-expanded': 'false' }, 'Ver todo');
      ver.addEventListener('click', () => {
        const ab = tarjeta.classList.toggle('completa');
        ver.textContent = ab ? 'Ver menos' : 'Ver todo';
        ver.setAttribute('aria-expanded', String(ab));
      });
      tarjeta.append(
        el('div.tarjeta-cab', el('h2#cl-' + (g.id === '*' ? 'general' : g.id), unica ? 'Clasificación general' : conGrupos ? g.nombre : 'Clasificación'), jugados ? ver : el('small', 'Sin partidos jugados')),
        el(
          'div.tabla-wrap',
          el(
            'table.clasif',
            el('caption', { class: 'sr', hidden: true }, (conGrupos && !unica ? g.nombre + ' · ' : '') + 'Clasificación ' + t.nombre),
            el(
              'thead',
              el(
                'tr',
                el('th', { scope: 'col', title: 'Posición' }, '#'),
                el('th.eq', { scope: 'col' }, 'Equipo'),
                el('th', { scope: 'col', title: 'Partidos jugados' }, 'PJ'),
                el('th.det', { scope: 'col', title: 'Ganados' }, 'G'),
                el('th.det', { scope: 'col', title: 'Empatados' }, 'E'),
                el('th.det', { scope: 'col', title: 'Perdidos' }, 'P'),
                el('th.det', { scope: 'col', title: 'Goles a favor' }, 'GF'),
                el('th.det', { scope: 'col', title: 'Goles en contra' }, 'GC'),
                el('th', { scope: 'col', title: 'Diferencia de goles' }, 'DG'),
                el('th', { scope: 'col', title: 'Puntos' }, 'Pts'),
                el('th.det', { scope: 'col' }, 'Últimos')
              )
            ),
            el(
              'tbody',
              filas.map((f) => {
                const z = zonaDe(t, f.pos);
                return el(
                  'tr' + (z ? '.' + z.clase : ''),
                  { onclick: () => fichaEquipo(t, f.id) },
                  el('td.pos', el('span', { title: z ? z.texto : null }, f.pos), z ? el('span.sr', { hidden: true }, ' · ' + z.texto) : null),
                  el('td.eq', el('button', { type: 'button', title: f.nombre }, f.corto, unica ? el('small.grupo-eq', { 'aria-label': 'Grupo ' + nombreGrupo(t, f.grupo) }, nombreGrupo(t, f.grupo)) : null)),
                  el('td', f.pj),
                  el('td.det', f.g),
                  el('td.det', f.e),
                  el('td.det', f.p),
                  el('td.det', f.gf),
                  el('td.det', f.gc),
                  el('td', f.dg > 0 ? '+' + f.dg : f.dg),
                  el('td.pts', f.pts),
                  el('td.det', forma(f.forma))
                );
              })
            )
          )
        )
      );
      const zonas = ZONAS[t.id] || [];
      if (zonas.length) tarjeta.append(el('ul.zonas', zonas.map((z) => el('li', el('i.' + z.clase, { 'aria-hidden': 'true' }), z.desde === z.hasta ? z.desde + 'º ' : `${z.desde}º–${z.hasta}º `, z.texto))));
      if (unica) tarjeta.append(el('p.leyenda', { style: 'padding-top:0' }, 'Clasificación conjunta de los grupos A y B. La letra junto a cada equipo indica su grupo.'));
      v.append(tarjeta);
    });

    // Fase final (eliminatorias)
    const rondas = t.jornadas.filter((j) => j.eliminatoria);
    if (rondas.length) {
      v.append(
        el(
          'section.tarjeta',
          el('div.tarjeta-cab', el('h2', 'Fase final')),
          el(
            'div.cuadro',
            rondas.map((j) => el('div.ronda', el('h3', j.nombre + (j.partidos[0] && j.partidos[0].fecha ? ' · ' + diaCorto(j.partidos[0].fecha) : '')), j.partidos.map((p) => tarjetaPartido(t, p, j, true))))
          )
        )
      );
    }
    v.append(el('p.leyenda', 'Victoria 3 puntos, empate 1. Empates a puntos: enfrentamientos directos, diferencia de goles y goles a favor.'));
  }

  const forma = (lista) => el('span.forma', { 'aria-label': 'Últimos resultados: ' + lista.map((x) => ({ V: 'victoria', E: 'empate', D: 'derrota' })[x]).join(', ') }, lista.map((x) => el('i.' + x, { 'aria-hidden': 'true' }, x)));

  /* ---------- Resultados ---------- */
  function jornadaPorDefecto(t) {
    const conRes = t.jornadas.filter((j) => j.partidos.some((p) => L.jugado(S.liga.resultados[p.id])));
    const proxima = t.jornadas.find((j) => j.partidos.some((p) => !S.liga.resultados[p.id] && (p.fecha || '9999') >= hoyIso()));
    if (conRes.length) {
      const ult = conRes[conRes.length - 1];
      // Si la última con resultados ya está completa y la próxima es inminente, mostrar la próxima
      const completa = ult.partidos.every((p) => S.liga.resultados[p.id]);
      return completa && proxima && proxima.n > ult.n ? proxima.n : ult.n;
    }
    return (proxima || t.jornadas[0]).n;
  }

  function vistaResultados(v, t) {
    const n = S.jornada[t.id] || jornadaPorDefecto(t);
    const idx = Math.max(0, t.jornadas.findIndex((j) => j.n === n));
    const j = t.jornadas[idx];
    const cambiar = (k) => {
      S.jornada[t.id] = t.jornadas[k].n;
      pintar();
    };
    const lista = el(
      'div.lista-jornadas',
      { role: 'tablist', 'aria-label': 'Jornadas' },
      t.jornadas.map((x, k) => {
        const hecha = x.partidos.length && x.partidos.every((p) => S.liga.resultados[p.id]);
        const corto = x.eliminatoria ? x.nombre.replace('Cuartos de final', 'Cuartos') : 'J' + x.n;
        return el(
          'button' + (hecha ? '.hecha' : ''),
          { type: 'button', role: 'tab', 'aria-current': String(k === idx), 'aria-label': x.nombre, onclick: () => cambiar(k) },
          corto,
          el('small', diaCorto(x.partidos[0] && x.partidos[0].fecha) || '—')
        );
      })
    );
    v.append(
      el(
        'div.jornadas',
        el('button.flecha', { type: 'button', 'aria-label': 'Jornada anterior', disabled: idx === 0 || null, onclick: () => cambiar(idx - 1) }, '‹'),
        lista,
        el('button.flecha', { type: 'button', 'aria-label': 'Jornada siguiente', disabled: idx === t.jornadas.length - 1 || null, onclick: () => cambiar(idx + 1) }, '›')
      ),
      el('h2', { style: 'font-size:1.15rem;margin:4px 4px 0' }, j.nombre)
    );
    requestAnimationFrame(() => {
      const b = lista.children[idx];
      if (b) lista.scrollLeft = b.offsetLeft - lista.clientWidth / 2 + b.clientWidth / 2;
    });

    const porDia = {};
    j.partidos.forEach((p) => (porDia[p.fecha || ''] = porDia[p.fecha || ''] || []).push(p));
    Object.keys(porDia)
      .sort()
      .forEach((d) => {
        v.append(el('h3.dia', diaLargo(d)));
        porDia[d].forEach((p) => v.append(tarjetaPartido(t, p, j)));
      });
    if (j.descansan && j.descansan.length) v.append(el('p.descansa', 'Descansa: ' + j.descansan.map((d) => nombreEq(t, d.equipo)).join(' · ')));
  }

  function tarjetaPartido(t, p, j, sinGrupo) {
    const r = S.liga.resultados[p.id];
    const ok = L.jugado(r);
    let centro;
    if (ok) centro = el('div.marcador', { 'aria-label': `Resultado ${r.gl} a ${r.gv}` }, `${r.gl} – ${r.gv}`);
    else if (r && r.estado) centro = el('div.marcador.estado', r.estado);
    else centro = el('div.marcador.pend', p.hora || 'vs');
    const cl = (a, b) => (!ok ? '' : a > b ? '.gana' : a < b ? '.pierde' : '');
    const grupo = sinGrupo ? '' : grupoDe(t, p.comp);
    const lugar = [p.instalacion, p.sede].filter(Boolean).join(' · ');
    return el(
      'button.partido',
      { type: 'button', onclick: () => fichaPartido(t, p, j) },
      grupo || lugar || (r && r.nota) ? el('div.meta', grupo ? el('span.chip', grupo) : null, el('span.lugar', lugar), r && r.nota ? el('span.chip.chip-amarillo', 'Nota') : null) : null,
      el('div.duelo', el('span.eq.l' + cl(r && r.gl, r && r.gv) + (p.local ? '' : '.tbd'), nombreEq(t, p.local)), centro, el('span.eq' + cl(r && r.gv, r && r.gl) + (p.visitante ? '' : '.tbd'), nombreEq(t, p.visitante)))
    );
  }

  /* ---------- Goleadores ---------- */
  function vistaGoleadores(v, t) {
    let lista = L.goleadores(S.liga, t);
    const filtro = S.filtroGol[t.id] || '';
    if (filtro) {
      lista = lista.filter((g) => (L.equipo(t, g.equipo) || {}).grupo === filtro);
      let pos = 0, ant = null;
      lista.forEach((x, i) => (x.goles !== ant ? ((pos = i + 1), (ant = x.goles)) : 0, (x.pos = pos)));
    }
    const tarjeta = el('section.tarjeta', el('div.tarjeta-cab', el('h2', 'Máximos goleadores'), el('small', t.corto)));
    if (t.grupos.length > 1)
      tarjeta.append(
        el(
          'div.filtro',
          [{ id: '', nombre: 'Todos' }, ...t.grupos].map((g) =>
            el('button', { type: 'button', 'aria-pressed': String(filtro === g.id), onclick: () => ((S.filtroGol[t.id] = g.id), pintar()) }, g.nombre)
          )
        )
      );
    if (!lista.length) tarjeta.append(el('div.vacio', el('b', 'Todavía no hay goles registrados'), 'Aparecerán en cuanto se publiquen las primeras actas.'));
    else {
      const maximo = Math.max(...lista.map((g) => g.goles)) || 1;
      tarjeta.append(
        el(
          'ol.gol-lista',
          lista.map((g) =>
            el(
              'li' + (g.pos === 1 ? '.top' : ''),
              el('span.p', g.pos === 1 ? el('span', '1') : g.pos),
              el(
                'span.n',
                el('b', g.nombre),
                el('small', nombreEq(t, g.equipo) + ' · ' + g.partidos + (g.partidos === 1 ? ' partido con gol' : ' partidos con gol')),
                el('span.gol-barra', { 'aria-hidden': 'true' }, el('i', { style: `width:${Math.round((g.goles / maximo) * 100)}%` }))
              ),
              el('span.g', { 'aria-label': g.goles + (g.goles === 1 ? ' gol' : ' goles') }, g.goles)
            )
          )
        )
      );
    }
    v.append(tarjeta);
  }

  /* ---------- Fichas ---------- */
  const hoja = $('#hoja');
  $('.hoja-cerrar').addEventListener('click', () => hoja.close());
  hoja.addEventListener('click', (e) => e.target === hoja && hoja.close());
  function abrirHoja(...contenido) {
    $('#hoja-contenido').replaceChildren(...contenido.filter(Boolean));
    if (!hoja.open) hoja.showModal();
    hoja.scrollTop = 0;
  }

  function fichaPartido(t, p, j) {
    const r = S.liga.resultados[p.id];
    const ok = L.jugado(r);
    const golesDe = (eq) => (r && r.goles ? r.goles.filter((g) => g.equipo === eq) : []);
    const lista = (eq, pp) =>
      el(
        'ul',
        golesDe(eq).map((g) => el('li', g.nombre, g.goles > 1 ? el('span.x', ' ×' + g.goles) : null)),
        pp ? el('li.pp', pp + (pp === 1 ? ' gol en propia puerta' : ' goles en propia puerta')) : null
      );
    const grupo = grupoDe(t, p.comp);
    abrirHoja(
      el('div.hoja-cab', el('small', [t.corto, grupo, j.nombre].filter(Boolean).join(' · ')), el('h2#hoja-titulo', ok ? 'Resultado final' : r && r.estado ? 'Partido ' + r.estado : 'Próximo partido')),
      el(
        'div.hoja-duelo',
        el('div.eq' + (p.local ? '' : '.tbd'), nombreEq(t, p.local)),
        ok ? el('div.marcador', `${r.gl} – ${r.gv}`) : el('div.marcador.pend', p.hora || 'vs'),
        el('div.eq' + (p.visitante ? '' : '.tbd'), nombreEq(t, p.visitante))
      ),
      ok && (r.goles.length || (r.pp && (r.pp.local || r.pp.visitante)))
        ? el('div.hoja-sec', el('h3', 'Goles'), el('div.goles-2', lista(p.local, r.pp && r.pp.local), lista(p.visitante, r.pp && r.pp.visitante)))
        : null,
      el(
        'div.hoja-sec',
        el('h3', 'Datos del partido'),
        el(
          'dl.datos',
          el('dt', 'Fecha'), el('dd', p.fecha ? diaLargo(p.fecha) + (p.hora ? ' · ' + p.hora : '') : 'Por determinar'),
          p.sede ? [el('dt', 'Sede'), el('dd', p.sede)] : null,
          p.instalacion ? [el('dt', 'Instalación'), el('dd', p.instalacion)] : null,
          p.direccion ? [el('dt', 'Dirección'), el('dd', p.direccion)] : null,
          r && r.acta && r.acta.numero ? [el('dt', 'Acta'), el('dd', r.acta.numero)] : null
        ),
        r && r.nota ? el('div.nota-pub', r.nota) : null
      )
    );
  }

  function fichaEquipo(t, id) {
    const e = L.equipo(t, id);
    const fila = L.clasificacion(S.liga, t, CLASIF_UNICA[t.id] ? '*' : e.grupo).find((f) => f.id === id);
    const grupo = t.grupos.length > 1 ? (t.grupos.find((g) => g.id === e.grupo) || {}).nombre : '';
    const goleadores = L.goleadores(S.liga, t).filter((g) => g.equipo === id);
    const suyos = [];
    t.jornadas.forEach((j) => j.partidos.forEach((p) => (p.local === id || p.visitante === id) && suyos.push({ p, j })));
    abrirHoja(
      el('div.hoja-cab', el('small', [t.corto, grupo].filter(Boolean).join(' · ')), el('h2#hoja-titulo', e.nombre)),
      fila
        ? el('div.hoja-sec', el('div.stats', el('div', el('b', fila.pos + 'º'), el('small', 'Posición')), el('div', el('b', fila.pts), el('small', 'Puntos')), el('div', el('b', `${fila.g}-${fila.e}-${fila.p}`), el('small', 'G-E-P')), el('div', { 'aria-label': `${fila.gf} goles a favor y ${fila.gc} en contra` }, el('b', `${fila.gf}:${fila.gc}`), el('small', 'GF : GC'))))
        : null,
      goleadores.length
        ? el('div.hoja-sec', el('h3', 'Goleadores'), el('ol.gol-lista', goleadores.map((g) => el('li', el('span.p', ''), el('span.n', el('b', g.nombre)), el('span.g', g.goles)))))
        : null,
      el(
        'div.hoja-sec',
        el('h3', 'Partidos'),
        el(
          'div.mini-partidos',
          suyos.map(({ p, j }) => {
            const r = S.liga.resultados[p.id];
            const ok = L.jugado(r);
            const local = p.local === id;
            const rival = nombreEq(t, local ? p.visitante : p.local);
            let res = null;
            if (ok) {
              const a = local ? r.gl : r.gv, b = local ? r.gv : r.gl;
              res = forma([a > b ? 'V' : a < b ? 'D' : 'E']);
            }
            return el(
              'button',
              { type: 'button', onclick: () => fichaPartido(t, p, j) },
              el('span.f', j.eliminatoria ? j.nombre.split(' ')[0] : 'J' + j.n, el('br'), diaCorto(p.fecha)),
              el('span', (local ? 'vs ' : 'en ') + rival),
              el('span.r', ok ? `${r.gl} – ${r.gv}` : r && r.estado ? r.estado : p.hora || ''),
              res || el('span')
            );
          })
        )
      )
    );
  }

  /* ---------- Arranque ---------- */
  $('#recargar').addEventListener('click', () => cargar(true));
  $('#volver').addEventListener('click', () => ir(null));
  // Los resultados se publican al cerrar cada acta: se comprueba si hay novedades cada 2 minutos
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - S.cargado > 60 * 1000) cargar(false);
  });
  setInterval(() => document.visibilityState === 'visible' && !$('#hoja').open && cargar(false), 2 * 60 * 1000);
  cargar(false);
})();
