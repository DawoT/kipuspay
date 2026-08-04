# KipusPay — especificación ejecutable

Repositorio de la **doctrina** de KipusPay: un POS y facturador electrónico multitenant
edge-native para SUNAT (Perú). Todavía no hay aplicación: lo que se versiona aquí es la
especificación normativa, el proceso y un gate que la verifica como si fuera código.

La regla que ordena todo: **cada regla de negocio vive una sola vez**, en la
especificación. Proceso, roadmap y GTM la citan por `§`; nunca la re-escriben.

## Empezar

```bash
scripts/bootstrap.sh   # instala el hook pre-commit y corre el gate completo
```

Los hooks de git no viajan en el clone: sin `bootstrap.sh`, `git commit` no verifica nada.

## Dónde vive cada cosa

| Ruta | Qué es |
|---|---|
| `AGENTS.md` | Contrato raíz: invariantes no negociables y router de lectura. Las herramientas de agente lo auto-cargan. |
| `INDEX.md` | Generado. Puntero de capability / regla / tabla / puerto / sprint → archivo. No editar a mano. |
| `docs/ARCHITECTURE.md` | Portada de la especificación: mapa capítulo → archivo y Registry de Reglas §0.4. |
| `docs/architecture/` | Los 18 capítulos de la especificación: DDL, motor transaccional, fiscal, seguridad. |
| `docs/PROCESS.md` | Roles, Definition of Done, Quality Gates, CI/CD, gobernanza, métricas. |
| `docs/ROADMAP.md` | Portada del roadmap: mapa fase → archivo y estado de especificación por sprint. |
| `docs/roadmap/` | Una fase por archivo (15): alcance, entregables y Quality Gate de cada sprint. |
| `docs/GTM.md` | Claims comerciales, pricing y gates GTM. |
| `docs/LEDGER.md` | Registro append-only de todo cambio normativo, con cadena de hashes. **Inmutable.** |
| `scripts/` | El gate: `verify.sh` y los checks de `scripts/checks/`. |

## El gate

```bash
scripts/verify.sh                                    # veredicto completo
scripts/verify.sh | awk '$1=="RESULT" && $3=="RED"'  # solo lo que falla
```

Cada check emite `RESULT <ID> GREEN|RED` y la última línea es `RESULT SUITE GREEN|RED`.
La tabla de qué verifica cada ID está en `AGENTS.md` §5. Corre en el hook `pre-commit`
y en CI (`.github/workflows/verify.yml`).

Dos reglas del gate que conviene conocer antes del primer commit:

- **El ledger es append-only.** Una entrada commiteada no se edita ni se borra: toda
  corrección es una entrada nueva con `relacion: CORRIGE` (V-16).
- **Los paths son ASCII, sin espacios y en inglés.** Un nombre con espacios ya causó un
  falso GREEN en esta batería; V-17 lo bloquea desde entonces.
- **Ningún archivo de doctrina pasa de 1000 líneas** (V-19). Si una sección crece, se
  parte por `§`: un agente no debería cargar 900 líneas para leer 80.

## Convenciones de escritura

- Dinero siempre en `INTEGER cents` (`*_cents`), nunca `REAL`.
- Todo `CREATE TABLE` dentro de un fence ` ```sql ` para que sea extraíble por herramientas.
- Números en texto, nunca dentro de una imagen: un agente no puede leer un PNG.
- Si tocas capabilities, DDL, reglas, puertos o packages: `scripts/index.sh` para
  regenerar `INDEX.md`.
