const ACCESS_DENIED_MESSAGE = 'Terminal IPC is available only to Stacki.';
const FALLBACK_ERROR_MESSAGE = 'Terminal operation failed.';

function safeErrorMessage(error) {
  if (error instanceof Error && typeof error.message === 'string' && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error) {
    return error;
  }
  return FALLBACK_ERROR_MESSAGE;
}

function registerTerminalIpc({ ipcMain, manager, isAllowedSender }) {
  const assertAllowed = (event) => {
    if (!isAllowedSender(event)) {
      throw new Error(ACCESS_DENIED_MESSAGE);
    }
  };
  const reportError = (event, payload, error) => {
    event.sender.send('terminal:error', {
      sessionId: payload?.sessionId || null,
      message: safeErrorMessage(error),
    });
  };

  const start = async (event, payload) => {
    assertAllowed(event);
    return manager.start(payload);
  };
  const restart = async (event, payload) => {
    assertAllowed(event);
    return manager.restart(payload);
  };
  const dispose = async (event, payload) => {
    assertAllowed(event);
    return { ok: manager.dispose(payload) };
  };
  const input = (event, payload) => {
    if (!isAllowedSender(event)) return;
    try {
      manager.write(payload);
    } catch (error) {
      reportError(event, payload, error);
    }
  };
  const resize = (event, payload) => {
    if (!isAllowedSender(event)) return;
    try {
      manager.resize(payload);
    } catch (error) {
      reportError(event, payload, error);
    }
  };

  ipcMain.handle('terminal:start', start);
  ipcMain.handle('terminal:restart', restart);
  ipcMain.handle('terminal:dispose', dispose);
  ipcMain.on('terminal:input', input);
  ipcMain.on('terminal:resize', resize);

  let cleaned = false;
  return () => {
    if (cleaned) return;
    cleaned = true;
    ipcMain.removeHandler('terminal:start');
    ipcMain.removeHandler('terminal:restart');
    ipcMain.removeHandler('terminal:dispose');
    ipcMain.removeListener('terminal:input', input);
    ipcMain.removeListener('terminal:resize', resize);
  };
}

module.exports = { registerTerminalIpc };
