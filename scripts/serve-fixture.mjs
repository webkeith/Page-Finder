import { createFixtureServer } from './fixture-server.mjs';

const port = Number(process.env.PORT) || 4000;
createFixtureServer().server.listen(port, () => console.log(`Sample site running at http://localhost:${port}`));
