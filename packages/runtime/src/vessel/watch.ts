import type { OpenVessel } from 'openvessel';

const S_IFMT = 0o170000;
const S_IFDIR = 0o040000;

/**
 * Watches a directory tree.
 *
 * The runtime only watches a single directory, so every directory of the tree is watched and the
 * set of watched directories is refreshed whenever the tree's shape changes.
 *
 * @param listener called with paths relative to `root`, with a leading slash.
 * @returns a function that stops watching.
 */
export async function watchTree(
  vessel: OpenVessel,
  root: string,
  listener: (eventType: 'change' | 'rename', filePath: string) => void,
): Promise<() => void> {
  const stops = new Map<string, () => Promise<unknown>>();
  let closed = false;
  let refreshing: Promise<void> | undefined;

  const refresh = () => {
    refreshing ??= listDirectories(vessel, root)
      .then((directories) => {
        if (closed) {
          return;
        }

        const known = new Set(directories);

        for (const [directory, stop] of stops) {
          if (!known.has(directory)) {
            stops.delete(directory);
            void stop();
          }
        }

        for (const directory of directories) {
          if (!stops.has(directory)) {
            watchDirectory(directory);
          }
        }
      })
      .catch(() => {
        // a directory that vanished mid-walk needs no watching
      })
      .finally(() => {
        refreshing = undefined;
      });

    return refreshing;
  };

  const watchDirectory = (directory: string) => {
    void vessel.fs
      .watch(directory, (event) => {
        listener(event.type as 'change' | 'rename', event.path.slice(root.length));

        if (event.type === 'rename') {
          void refresh();
        }
      })
      .then((stop) => {
        if (closed) {
          void stop();
        } else {
          stops.set(directory, stop);
        }
      });
  };

  await refresh();

  return () => {
    closed = true;

    for (const stop of stops.values()) {
      void stop();
    }

    stops.clear();
  };
}

async function listDirectories(vessel: OpenVessel, root: string) {
  const directories: string[] = [];
  const queue = [root];

  while (queue.length > 0) {
    const directory = queue.shift() as string;

    directories.push(directory);

    const entries = (await vessel.fs.readdir(directory, { withFileTypes: true })) as [string, number][];

    for (const [name, mode] of entries) {
      if ((mode & S_IFMT) === S_IFDIR) {
        queue.push(`${directory}/${name}`);
      }
    }
  }

  return directories;
}
