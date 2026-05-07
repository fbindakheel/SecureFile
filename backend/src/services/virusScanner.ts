export const scanFile = async (filePath: string): Promise<'CLEAN' | 'INFECTED'> => {
  // Simulate a virus scan delay
  await new Promise(resolve => setTimeout(resolve, 1500));
  
  // For this simple MVP, we just pretend it's clean 99% of the time.
  // If the filename has "virus" in it, we flag it as infected (can be used for testing).
  if (filePath.toLowerCase().includes('virus')) {
    return 'INFECTED';
  }
  return 'CLEAN';
};
