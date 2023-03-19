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

export const relayUrlNormalize = (url: string) => {
  return url
    .replace(/^[⬤\s]+|\s+$/g, '')
    .replace(/^https?:\/\//, 'wss://')
    .replace(/^(?!wss?:\/\/)([\w.-]+(\/|$))/, 'wss://$1')
    .replace(/(:\/\/[^/]+)\/$/, '$1');
};

export const shuffle = <T>(arr: T[]) => {
  const newArr = [...arr];
  for (let i = newArr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

export const uniq = <T>(arr: T[]) => {
  return [...new Set(arr)];
};

export const uniqLast = <T>(arr: T[]) => {
  return uniq(arr.reverse()).reverse();
};
