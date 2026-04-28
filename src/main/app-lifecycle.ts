let isAppQuitting = false;

export function markAppQuitting(): void {
  isAppQuitting = true;
}

export function getIsAppQuitting(): boolean {
  return isAppQuitting;
}
