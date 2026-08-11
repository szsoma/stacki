import React, { useEffect, useState } from 'react';
import { cleanError } from '../App.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import { LayersIcon, CloseIcon } from '../ui/Icons.jsx';
import StackiLogo from '../ui/StackiLogo.jsx';
import WelcomeBackground from '../ui/WelcomeBackground.jsx';

export default function WelcomeScreen({ onOpen, setBusy, showToast }) {
  const t = useT();
  const [error, setError] = useState(null);
  const [recents, setRecents] = useState([]);
  const [newProjectDir, setNewProjectDir] = useState(null);

  useEffect(() => {
    window.avb
      .listRecents()
      .then((list) => setRecents(list || []))
      .catch(() => {});
  }, []);

  const openExisting = async () => {
    setError(null);
    const result = await window.avb.openProjectDialog();
    if (result.canceled) return;
    if (result.error) {
      setError(result.error);
      return;
    }
    onOpen(result.projectPath);
  };

  // Pick the folder first, then collect the same answers `npm create
  // astro@latest` would ask for in the terminal; the wizard runs the real CLI.
  const createNew = async () => {
    setError(null);
    const result = await window.avb.newProjectDialog();
    if (result.canceled) return;
    if (result.error) {
      setError(result.error);
      return;
    }
    setNewProjectDir(result.projectPath);
  };

  return (
    <div className="welcome">
      <WelcomeBackground />
      {/* Hero fills the space above the recents strip, centered in it. */}
      <div className="welcome-hero">
        <StackiLogo width={320} className="welcome-logo" />
        <p className="welcome-tagline">{t('welcome.tagline')}</p>
        <div className="actions">
          <button className="primary" onClick={createNew}>
            {t('app.newProject')}
          </button>
          <button onClick={openExisting}>{t('app.openProject')}</button>
        </div>
        {error && <div className="error-text">{error}</div>}
      </div>

      {recents.length > 0 && (
        <div className="recents">
          <div className="recents-title">{t('welcome.recentHeader')}</div>
          <div className="recent-rail">
            {recents.map((r) => (
              <div
                key={r.path}
                className="recent-card"
                title={r.path}
                onClick={() => onOpen(r.path)}
              >
                <button
                  className="recent-remove"
                  title={t('welcome.removeRecent')}
                  onClick={(e) => {
                    e.stopPropagation();
                    window.avb.removeRecent(r.path);
                    setRecents((prev) => prev.filter((p) => p.path !== r.path));
                  }}
                >
                  <CloseIcon size={11} />
                </button>
                <div className="recent-thumb">
                  {r.thumb ? (
                    <img src={r.thumb} alt="" draggable={false} />
                  ) : (
                    <LayersIcon size={22} strokeWidth={1.2} />
                  )}
                </div>
                <div className="recent-name">{r.name}</div>
                <div className="recent-path">{r.path}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {newProjectDir && (
        <NewProjectWizard
          dir={newProjectDir}
          onClose={() => setNewProjectDir(null)}
          onDone={(dir) => {
            setNewProjectDir(null);
            showToast(t('app.projectCreated'), 'success');
            onOpen(dir);
          }}
        />
      )}
    </div>
  );
}

// Runs the real create-astro CLI with the answers collected here, streaming
// its output so it reads like the terminal session it replaces.
function NewProjectWizard({ dir, onClose, onDone }) {
  const t = useT();

  const TEMPLATES = [
    { value: 'basics', label: t('welcome.template.basics'), hint: t('welcome.template.basicsHint') },
    { value: 'blog', label: t('welcome.template.blog'), hint: t('welcome.template.blogHint') },
    { value: 'starlight', label: t('welcome.template.starlight'), hint: t('welcome.template.starlightHint') },
    { value: 'minimal', label: t('welcome.template.minimal'), hint: t('welcome.template.minimalHint') },
  ];

  const [template, setTemplate] = useState('basics');
  const [install, setInstall] = useState(true);
  const [git, setGit] = useState(true);
  const [ai, setAi] = useState(false);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState('');
  const [failed, setFailed] = useState(null);
  const logRef = React.useRef(null);

  useEffect(() => {
    const off = window.avb.onCreateLog((chunk) => setLog((prev) => (prev + chunk).slice(-20000)));
    return off;
  }, []);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  const run = async () => {
    setRunning(true);
    setFailed(null);
    setLog('');
    try {
      await window.avb.createAstroProject({ dir, template, install, git, ai });
      onDone(dir);
    } catch (err) {
      setRunning(false);
      setFailed(cleanError(err));
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && !running && onClose()}
    >
      <div className="modal new-project-modal">
        <div className="modal-header">{t('welcome.newAstroProject')}</div>
        <div className="modal-body">
          <div className="new-project-dir" title={dir}>
            {dir}
          </div>

          {!running && !failed && (
            <>
              <div>
                <label>{t('welcome.chooseStarter')}</label>
                <div className="template-list">
                  {TEMPLATES.map((t) => (
                    <div
                      key={t.value}
                      className={`template-option ${template === t.value ? 'on' : ''}`}
                      onClick={() => setTemplate(t.value)}
                    >
                      <div className="template-name">{t.label}</div>
                      <div className="template-hint">{t.hint}</div>
                    </div>
                  ))}
                </div>
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={install}
                  onChange={(e) => setInstall(e.target.checked)}
                />
                {t('welcome.installDeps')}
              </label>
              <label className="check-row">
                <input type="checkbox" checked={git} onChange={(e) => setGit(e.target.checked)} />
                {t('welcome.initGit')}
              </label>
              <label className="check-row">
                <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
                {t('welcome.addAi')}
              </label>
            </>
          )}

          {(running || failed) && (
            <pre className="create-log" ref={logRef}>
              {log || t('welcome.starting')}
            </pre>
          )}
          {failed && <div className="error-text">{failed}</div>}
        </div>
        <div className="modal-footer">
          <button onClick={onClose} disabled={running}>
            {failed ? t('common.close') : t('common.cancel')}
          </button>
          <button className="primary" onClick={run} disabled={running}>
            {running ? t('welcome.creating') : failed ? t('welcome.tryAgain') : t('welcome.createProject')}
          </button>
        </div>
      </div>
    </div>
  );
}
