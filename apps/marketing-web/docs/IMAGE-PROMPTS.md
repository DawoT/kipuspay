# Prompts de imagen para KipusPay — para un agente de IA (Gemini)

> Uso: este archivo es el insumo para que un agente IA (p. ej. Gemini) genere
> los assets visuales del sitio de marketing. Cada prompt está calibrado con
> el sistema de diseño de KipusPay (GTM sección 5.11 "Ledger Minimalism"): tintas
> profundas, ámbar cálido, grano de papel, cero azul corporativo, cero
> pantallas de software.

## Reglas transversales (incluir en todo prompt)

- Idioma visual: fotografía documental cálida estilo A24/Apple launch films.
- Paleta: tintas profundas (#14161c), ámbar cálido (#d99a3d), blanco papel
  (#f3efe6), verde sello (#2e9e74). Sin azul frío.
- NO texto en la imagen, NO logos, NO UI, NO mockups de pantalla, NO
  smartphones con interfaz visible.
- Lente 35mm, profundidad de campo media, luz de hora dorada.
- Sin efectos glitch, sin neon, sin hologramas, sin render 3D evidente.
- Formato: 16:9 salvo que se indique otra cosa.

## 1. Posters de hero por vertical (5)

Destino: `apps/marketing-web/static/media/hero-{vertical}.jpg` (reemplaza el
poster compartido `hero-poster.svg`; actualiza `heroPoster` en
`apps/marketing-web/src/lib/content/verticals.ts`).

### 1.1 Restaurantes — `hero-restaurantes.jpg`
Comercial cinematográfico, 10 segundos, loop, sin texto ni logos. Un
restaurante pequeño latinoamericano a la hora dorada: close-up (0-3s) de las
manos de un mozo sirviendo un plato de menú en el mostrador, el fondo con
bokeh cálido; plano medio (3-6s) de una familia sonriendo mientras reciben
la cuenta en la mesa; plano abierto (6-10s) de la fachada del local al
anochecer con luz cálida encendida. Calma, ritmo pausado, sin prisa.
Negative: no text, no logos, no UI, no screens, no neon, no stock corporate
handshake energy, no overly staged.

### 1.2 Farmacias — `hero-farmacias.jpg`
Comercial cinematográfico, 10 segundos, loop. Interior de una botica de
barrio en hora dorada: close-up (0-3s) de las manos de la químico entregando
una caja de medicamento sobre el mostrador; plano medio (3-6s) de la
vendedora marcando la venta en una tablet cuya pantalla queda difuminada en
bokeh; plano abierto (6-10s) de la botica desde la calle al atardecer, luz
cálida. Confianza, orden, calma.
Negative: no text, no logos, no UI, no blister shots with brand names, no
neon, no sterile lab look.

### 1.3 Retail y ferretería — `hero-retail.jpg`
Comercial cinematográfico, 10 segundos, loop. Una ferretería de barrio a la
hora dorada: close-up (0-3s) de manos contando billetes sobre el mostrador
de madera; plano medio (3-6s) del dueño entregando el vuelto y la boleta a
un cliente, ambos tranquilos; plano abierto (6-10s) del local desde fuera
con la puerta abierta y luz cálida. Texturas de madera, metal y papel.
Negative: no text, no logos, no UI, no cash register close-ups with brand,
no neon.

### 1.4 Servicios (spas, talleres, consultorios) — `hero-servicios.jpg`
Comercial cinematográfico, 10 segundos, loop. Un consultorio/taller
pequeño a la luz dorada de la tarde: close-up (0-3s) de la recepcionista
tomando una cita en una tablet (pantalla en bokeh); plano medio (3-6s) del
profesional despidiendo a un cliente satisfecho; plano abierto (6-10s) de la
sala de espera cálida y ordenada. Serenidad, sin inventario visible.
Negative: no text, no logos, no UI, no clinic sterility (keep it warm), no
neon.

### 1.5 Cadenas y multi-local — `hero-cadenas.jpg`
Comercial cinematográfico, 10 segundos, loop. Un dueño mirando su negocio
desde la vereda: close-up (0-3s) de sus manos con una taza de café frente a
un ventanal con bokeh de luces de local; plano medio (3-6s) del dueño
revisando su celular (pantalla difuminada, sin UI legible) con una sonrisa
tranquila; plano abierto (6-10s) de dos locales de la misma marca en la
misma cuadra al anochecer. Control sereno, visión de conjunto.
Negative: no text, no logos, no UI, no dashboard on screen, no neon.

## 2. Portadas de blog (3)

Destino: `apps/marketing-web/static/media/blog-cover-{slug}.jpg` (se usan en
`/blog/[slug]` y como opción de og:image por post).

### 2.1 `blog-cover-primera-venta-el-mismo-dia.jpg`
Fotografía documental, 16:9: un comerciante de barrio encendiendo por
primera vez su caja delante de un cliente sonriente en hora dorada; sobre el
mostrador, una libreta de cuadros cerrada de lado (la "vieja costumbre" que
se deja atrás). Cálido, sin texto.

### 2.2 `blog-cover-recomienda-y-gana-un-mes.jpg`
Fotografía documental, 16:9: dos dueños de negocio conversando en la puerta
de sus locales vecinos, uno muestra su celular al otro (pantalla en bokeh,
sin UI); la luz de la tarde dibuja sombras largas. Confianza entre pares,
sin texto.

### 2.3 `blog-cover-control-interno-sin-confundir.jpg`
Fotografía documental, 16:9: un mostrador de botica con un ticket de papel
apoyado junto a una caja registradora apagada; mano del vendedor señalando
el ticket. Sin texto legible en el ticket (textura, no tipografía).

## 3. Tarjeta social genérica

Destino: `apps/marketing-web/static/media/og-home.png` (1200×630, PNG).

Imagen de marca 1200×630: composición minimalista ledger — fondo tinta
profunda con textura de papel, una línea de quipu (nudos andinos estilizados
en ámbar) que atraviesa el encuadre en diagonal, espacio negativo amplio a
la izquierda para el título (la tipografía la pone el sitio, no la imagen).
Sin texto. Estilo: identidad de marca, no fotografía.

## Notas de entrega

- Generar a 1200×630 como mínimo; los posters de hero se recortan a 16:9 en
  el navegador (object-fit: cover).
- Validar contra el checklist de la sección 5.11 del GTM: si la imagen pudiera confundirse
  con Bsale/Alegra/Siigo (azul corporativo, capturas de dashboard), no sirve.
- Actualizar el campo `heroPoster` de cada vertical en `verticals.ts` cuando
  exista el asset nuevo, y el OG de cada página si se quiere por-página.
