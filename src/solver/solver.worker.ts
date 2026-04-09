// Web worker for solving the cube using cubejs library

let initialized = false
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let Cube: any = null

async function ensureInit() {
  if (!initialized) {
    const mod = await import('cubejs')
    Cube = mod.default ?? mod
    Cube.initSolver()
    initialized = true
  }
}

self.onmessage = async (e: MessageEvent<{ id: string; faceString: string }>) => {
  const { id, faceString } = e.data
  try {
    await ensureInit()
    const cube = Cube.fromString(faceString)
    const solution = cube.solve()
    self.postMessage({ id, solution, error: null })
  } catch (err) {
    self.postMessage({ id, solution: null, error: String(err) })
  }
}

export {}
