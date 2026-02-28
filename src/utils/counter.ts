export const createCounter = () => {
  let count = 1;

  return {
    next: () => {
      count = (count % 65_535) + 1;

      return count;
    },
  };
};
