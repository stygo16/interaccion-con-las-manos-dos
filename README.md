# Piano Virtual controlado con las manos

Piano de 3 octavas (C3–B5) con estética neon que se toca de tres formas:
con las manos frente a la cámara, con el ratón/tacto, o con la voz. El sonido
se sintetiza con la Web Audio API, sin samples, con latencia mínima.

## Stack

| Capa | Biblioteca |
| --- | --- |
| Dibujo (teclado, video, esqueleto de manos) | p5.js 1.11 |
| Detección de manos (21 landmarks por mano, MediaPipe) | ml5.js 1.4 |
| Sonido (síntesis de piano con ADSR, polifónico) | Web Audio API nativa |
| Notas por voz ("sol4", "g4") | Web Speech API |

## Cómo ejecutarlo

La cámara (`getUserMedia`) exige un contexto seguro: `localhost` o HTTPS.
Sirve la carpeta con un servidor local y abre la URL en Chrome o Edge:

```sh
npx serve .
```

o

```sh
python -m http.server 8080
# http://localhost:8080
```

## Cómo se toca

1. Pulsa **Empezar** (esto activa la cámara y el audio, requerido por el navegador).
2. La primera carga descarga el modelo de manos (~10 MB), tarda unos segundos.
3. **Con las manos**: baja la punta de un dedo hasta cruzar la **línea celeste**
   → suena la nota y la tecla se ilumina; levanta el dedo → se suelta.
   Cada mano aporta 4 dedos: hasta 8 notas simultáneas.
4. **Con el ratón o el tacto**: haz clic (o toca) una tecla y mantén para
   sostener la nota.
5. **Con la voz**: activa el micrófono en el panel superior derecho y di una
   nota — «g4», «sol4», «ge cuatro»… Se aceptan nombres en inglés (c–b),
   nombres de letras en español (ge, ce, de…) y solfeo (do, re, mi, fa, sol,
   la, si), siempre con octava 3, 4 o 5.
6. El **volumen** se ajusta con el control deslizante del panel.

## Pruebas

- `node voice.test.js` — pruebas unitarias del parser de notas habladas
  (sin framework; requiere Node.js).

## Archivos

- `index.html` — estructura, CDN, overlay de inicio y panel de controles.
- `sketch.js` — cámara, detección de manos, estado de presión, ratón/tacto,
  micrófono y render.
- `piano.js` — geometría del teclado de 3 octavas, hit-testing y dibujo neon.
- `audio.js` — síntesis polifónica de piano con envolventes sin clics y volumen.
- `voice.js` — parser puro de notas habladas (testeable con Node).
- `voice.test.js` — pruebas del parser.
- `style.css` — estilos neon del overlay y el panel de controles.
