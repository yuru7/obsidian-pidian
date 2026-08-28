/** Pi's extension loader imports jiti even when extensions are disabled. */
export function createJiti() {
  const load = async () => {
    throw new Error("Pidian does not load Pi extensions");
  };
  return Object.assign(load, {
    import: load,
    esmResolve: () => "",
  });
}

export default createJiti;
