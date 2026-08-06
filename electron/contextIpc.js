const contextFiles = require('./contextFiles');
const astroParser = require('./astroParser');

function registerContextIpc({
  ipcMain,
  isAllowedSender,
  getProjectRoot,
  listProjectFiles = contextFiles.listProjectFiles,
  readProjectFile = contextFiles.readProjectFile,
  serializeNode = (node) => astroParser.serializeNodes([node]),
  writeContextBundle = contextFiles.writeContextBundle,
}) {
  const assertAllowed = (event) => {
    if (!isAllowedSender(event)) {
      throw new Error('Context IPC is available only to Stacki.');
    }
  };
  const requireRoot = () => {
    const root = getProjectRoot();
    if (!root) throw new Error('Open a project before attaching context.');
    return root;
  };

  const listFiles = async (event) => {
    assertAllowed(event);
    return { files: listProjectFiles(requireRoot()) };
  };
  const readFile = async (event, payload) => {
    assertAllowed(event);
    return readProjectFile(requireRoot(), payload?.rel);
  };
  const serialize = async (event, payload) => {
    assertAllowed(event);
    return { markup: serializeNode(payload?.node) };
  };
  const writeBundle = async (event, payload) => {
    assertAllowed(event);
    return writeContextBundle(requireRoot(), payload?.markdown);
  };

  ipcMain.handle('context:listFiles', listFiles);
  ipcMain.handle('context:readFile', readFile);
  ipcMain.handle('context:serializeNode', serialize);
  ipcMain.handle('context:writeContextBundle', writeBundle);

  return () => {
    ipcMain.removeHandler('context:listFiles');
    ipcMain.removeHandler('context:readFile');
    ipcMain.removeHandler('context:serializeNode');
    ipcMain.removeHandler('context:writeContextBundle');
  };
}

module.exports = { registerContextIpc };
