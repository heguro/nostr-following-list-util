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

export const jsonStringifyOrNull = (obj: unknown) => {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    return null;
  }
};

export const secToDateString = (sec?: number) => {
  return msecToDateString(sec && sec * 1000);
};

export const msecToDateString = (msec?: number) => {
  if (!msec) msec = Date.now();
  const date = new Date(msec);
  return `${date.getFullYear()}-${
    date.getMonth() + 1
  }-${date.getDate()}_${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
};
