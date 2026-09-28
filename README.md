# SimPLC (nombre provisorio)

Plataforma web gratuita y bilingüe (español / inglés) para aprender PLC desde cero, con un
simulador en el navegador (Ladder, ST, FBD, IL y SFC), teoría, ejemplos con plantas virtuales
y desafíos con corrección automática.

## Desarrollo

Requisitos: Node.js 24 y npm.

```bash
npm install
npm run dev        # http://localhost:4321
npm run lint       # ESLint + Prettier
npm run test       # tests unitarios (Vitest)
npm run build      # chequeo de tipos + build estático
npm run test:e2e   # tests end-to-end (Playwright, usa Microsoft Edge)
```

La especificación completa está en [`PROMPT_SIMPLC.md`](PROMPT_SIMPLC.md) y las convenciones de
código en [`CLAUDE.md`](CLAUDE.md).
