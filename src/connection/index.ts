import {
  fetchObjectList,
  fetchPrinterInfo,
  fetchServerInfo,
  queryObjects,
  websocketUrl,
} from '../api/moonraker';
import { isNative } from '../native';
import type { Printer } from '../store';
import { nativeTransport } from './nativeTransport';
import { PrinterConnection } from './PrinterConnection';
import { webTransport } from './transport';

/** A live connection to the printer, with the right transport for the platform. */
export function createConnection(printer: Printer): PrinterConnection {
  return new PrinterConnection({
    url: websocketUrl(printer),
    transport: isNative ? nativeTransport : webTransport,
    clientVersion: __APP_VERSION__,
    http: {
      serverInfo: () => fetchServerInfo(printer),
      printerInfo: () => fetchPrinterInfo(printer),
      objectList: () => fetchObjectList(printer),
      query: (objects) => queryObjects(printer, objects),
    },
  });
}
