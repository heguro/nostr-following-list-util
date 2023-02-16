export const delay = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

export const jsonParseOrEmptyObject = (str: string) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    return {};
  }
};

export const jsonParseOrEmptyArray = (str: string) => {
  try {
    return JSON.parse(str);
  } catch (e) {
    return [];
  }
};
