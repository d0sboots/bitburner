export default NSProxy;

/** @param {NS} ns */
function NSProxy(ns) {
  const memoed = {};
  const handler = {
    get(target, prop, receiver) {
      const ours = memoed[prop];
      if (ours) return ours;
      const field = Reflect.get(target, prop, receiver);
      if (!field) return field;
      if (typeof field === "object") {
        return (memoed[prop] = NSProxy(field));
      }
      if (typeof field === "function") {
        return (memoed[prop] = field.bind(ns));
      }
      return (memoed[prop] = field);
    },
  };

  return new Proxy(ns, handler);
}
