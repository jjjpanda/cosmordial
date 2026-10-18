import * as esbuild from 'esbuild';

const opts = {
  entryPoints: { cosmordial: 'src/index.js', embed: 'src/embed.js' },
  bundle: true,
  format: 'esm',
  outdir: 'dist',
  loader: { '.css': 'text' },
};

if (process.argv.includes('--serve')) {
  const ctx = await esbuild.context({ ...opts, sourcemap: true });
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: '.' });
  console.log(`http://localhost:${port}`);
} else {
  await esbuild.build({ ...opts, minify: true });
}
