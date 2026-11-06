import { ForceLayout } from "./layout";

type LayoutRequest = { ids: string[]; pairs: [string, string][] };
type LayoutResponse = { positions?: [number, number, number][]; done?: boolean; error?: string };

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<LayoutRequest>) => void) | null;
  postMessage: (message: LayoutResponse) => void;
};

workerScope.onmessage = ({ data }) => {
  try {
    const layout = new ForceLayout();
    layout.setGraph(data.ids, data.pairs);
    let iterations = 0;
    while (!layout.settled && iterations < 1500) {
      layout.tick(1);
      iterations++;
      if (iterations % 18 === 0 && !layout.settled) {
        const positions = data.ids.map((id) => {
          const point = layout.get(id)!;
          return [point.x, point.y, point.z] as [number, number, number];
        });
        workerScope.postMessage({ positions, done: false });
      }
    }
    const positions = data.ids.map((id) => {
      const point = layout.get(id)!;
      return [point.x, point.y, point.z] as [number, number, number];
    });
    workerScope.postMessage({ positions, done: true });
  } catch (error) {
    workerScope.postMessage({ error: error instanceof Error ? error.message : "Layout worker failed." });
  }
};
