/** runParallelTasks executes async tasks with a bounded concurrency limit. */
export async function runParallelTasks<TaskResult>(
  taskFactories: Array<() => Promise<TaskResult>>,
  concurrencyLimit: number,
): Promise<TaskResult[]> {
  if (taskFactories.length === 0) {
    return [];
  }

  const boundedConcurrency = Math.max(1, Math.floor(concurrencyLimit));
  const taskResults: TaskResult[] = new Array(taskFactories.length);
  let nextTaskIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextTaskIndex < taskFactories.length) {
      const currentTaskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      const taskFactory = taskFactories[currentTaskIndex];
      if (!taskFactory) {
        continue;
      }
      taskResults[currentTaskIndex] = await taskFactory();
    }
  }

  const workerCount = Math.min(boundedConcurrency, taskFactories.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));

  return taskResults;
}
