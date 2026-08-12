// @ts-nocheck -- checkJs backlog; see docs/checkjs-migration.md
import React, { useEffect, useRef, useState } from 'react';
import { cleanError } from '../App.jsx';
import { useT } from '../i18n/I18nContext.jsx';
import { BranchIcon, CheckIcon, ExternalIcon, CloseIcon } from '../ui/Icons.jsx';

// owner/repo out of any GitHub remote form (https or ssh), for display.
const repoSlug = (url) => {
  const m = String(url || '').match(/github\.com[:/]+([^/]+\/[^/]+?)(?:\.git)?$/i);
  return m ? m[1] : url;
};
const webUrl = (url) => {
  const slug = repoSlug(url);
  return slug && slug !== url ? `https://github.com/${slug}` : url;
};

// Branch/status chip in the title bar. Opens a dropdown with branch
// switching, branch creation, commit + push, and GitHub publishing.
export default function GitChip({ project, showToast, flushSave, onWorktreeChanged }) {
  const t = useT();
  const [info, setInfo] = useState(null);
  const [open, setOpen] = useState(false);
  const [commitMsg, setCommitMsg] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [error, setError] = useState(null);
  // Label of the action in flight, or null. Doubles as the busy flag so the
  // chip itself can say what it's doing while the dropdown is closed.
  const [busy, setBusy] = useState(null);
  const working = busy !== null;
  const [showPublish, setShowPublish] = useState(false);
  const [switchTo, setSwitchTo] = useState(null); // branch awaiting a dirty-tree decision
  const wrapRef = useRef(null);

  const refresh = async () => {
    const result = await window.avb.gitInfo(project.path);
    setInfo(result);
    return result;
  };

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [project.path]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const act = async (fn, successMsg, label = t('gitChip.working')) => {
    setBusy(label);
    setError(null);
    try {
      await flushSave();
      await fn();
      await refresh();
      // Checkout/pull rewrite the working tree — re-read what's open so the
      // editor and preview show the branch that's actually checked out.
      if (onWorktreeChanged) await onWorktreeChanged();
      if (successMsg) showToast(successMsg, 'success');
    } catch (err) {
      const msg = cleanError(err);
      // A failed branch switch leaves you on the branch you were already on,
      // so this has to stay on screen — a toast that fades is how edits end
      // up on the wrong branch without anyone noticing.
      setError(msg);
      setOpen(true);
      showToast(msg, 'error');
      setBusy(null);
      return false;
    }
    setBusy(null);
    return true;
  };

  // Git carries uncommitted changes across a checkout, and this editor saves
  // to disk constantly — so without asking first, work done on one branch
  // silently follows you to the next and gets committed there. Switching with
  // a dirty tree stops here and makes the choice explicit.
  const requestSwitch = (branch) => {
    if (branch === info.branch) return;
    if (info.dirty) {
      setSwitchTo(branch);
      setOpen(false);
      return;
    }
    switchNow(branch);
  };

  const switchNow = (branch) =>
    act(
      () => window.avb.gitCheckout({ projectPath: project.path, branch }),
      t('gitChip.switchedTo', { branch }),
      t('gitChip.switching')
    );

  const commitThenSwitch = (branch, message) => {
    const from = info.branch;
    return act(
      async () => {
        await window.avb.gitCommit({ projectPath: project.path, message });
        await window.avb.gitCheckout({ projectPath: project.path, branch });
      },
      t('gitChip.committedToSwitched', { from, to: branch }),
      t('gitChip.committing')
    );
  };

  // Publishing is driven from the modal so it can show each step and keep the
  // form (and any error) in place instead of closing on a fire-and-forget.
  const publish = async ({ repoName, isPrivate, onStep }) => {
    setBusy(t('gitChip.publishing'));
    try {
      await flushSave();
      const state = await refresh();
      if (state.dirty || state.branch === '(no commits yet)') {
        onStep(t('gitChip.committingChanges'));
        await window.avb.gitCommit({
          projectPath: project.path,
          message: t('gitChip.initialCommitMsg'),
        });
      }
      onStep(t('gitChip.creatingRepoAndPushing'));
      const res = await window.avb.gitPublish({
        projectPath: project.path,
        repoName,
        isPrivate,
      });
      await refresh();
      return res?.url || null;
    } finally {
      setBusy(null);
    }
  };

  if (!info) return null;

  if (!info.isRepo) {
    return (
      <button
        className="git-chip"
        disabled={working}
        onClick={() =>
          act(
            () => window.avb.gitInit(project.path),
            t('gitChip.initialized'),
            t('gitChip.initializing')
          )
        }
      >
        {working ? <span className="mini-spinner" /> : <BranchIcon size={12} />}
        {working ? busy : t('gitChip.initializeGit')}
      </button>
    );
  }

  const commit = () => {
    const message = commitMsg.trim() || t('gitChip.defaultCommitMsg');
    setCommitMsg('');
    act(
      () => window.avb.gitCommit({ projectPath: project.path, message }),
      t('gitChip.changesCommitted'),
      t('gitChip.committing')
    );
  };

  // Three distinct states, because "0 commits ahead" and "never pushed" mean
  // very different things — see hasUpstream in git:info.
  const pushLabel = !info.hasUpstream
    ? t('gitChip.pushBranchToOrigin', { branch: info.branch })
    : info.ahead > 0
      ? t('gitChip.pushCount', { count: info.ahead, plural: info.ahead === 1 ? '' : 's' })
      : t('gitChip.everythingPushed');
  const canPush = info.hasUpstream ? info.ahead > 0 : true;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        className={`git-chip ${working ? 'busy' : ''}`}
        onClick={() => {
          setOpen((o) => !o);
          refresh();
        }}
      >
        {working ? (
          <>
            <span className="mini-spinner" />
            {busy}
          </>
        ) : (
          <>
            <BranchIcon size={12} />
            <span className={`dot ${info.dirty ? 'dirty' : ''}`} />
            {info.branch}
            {info.ahead > 0 && <span style={{ color: 'var(--text-faint)' }}>↑{info.ahead}</span>}
          </>
        )}
      </button>

      {open && (
        <div className="dropdown">
          {error && (
            <div className="git-error">
              {error}
              <button className="ghost" title={t('gitChip.dismiss')} onClick={() => setError(null)}>
                <CloseIcon size={11} />
              </button>
            </div>
          )}
          <h3>{t('gitChip.branches')}</h3>
          {info.branches.map((b) => (
            <div
              key={b}
              className={`list-item ${b === info.branch ? 'active' : ''}`}
              onClick={() => requestSwitch(b)}
            >
              <span className="icon" style={{ width: 14 }}>
                {b === info.branch ? <CheckIcon size={12} /> : null}
              </span>
              <span className="label">{b}</span>
            </div>
          ))}
          <div className="dropdown-row">
            <input
              placeholder={t('gitChip.newBranchPlaceholder')}
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newBranch.trim()) {
                  const name = newBranch.trim();
                  setNewBranch('');
                  act(
                    () =>
                      window.avb.gitCheckout({
                        projectPath: project.path,
                        branch: name,
                        create: true,
                      }),
                    t('gitChip.createdBranch', { name }),
                    t('gitChip.creatingBranch')
                  );
                }
              }}
            />
          </div>

          <div className="divider" />
          <h3>{t('gitChip.commit')}</h3>
          <div className="dropdown-row" style={{ flexDirection: 'column', gap: 6 }}>
            <input
              placeholder={t('gitChip.commitMessage')}
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && info.dirty && !working) commit();
              }}
            />
            <button disabled={working || !info.dirty} onClick={commit}>
              {info.dirty ? t('gitChip.commitAllChanges') : t('gitChip.nothingToCommit')}
            </button>
          </div>

          <div className="divider" />
          <h3>{t('gitChip.githubHeader')}</h3>
          <div className="dropdown-row" style={{ flexDirection: 'column', gap: 6 }}>
            {info.remote ? (
              <>
                <button
                  className="repo-link"
                  title={t('gitChip.openOnGithub', { repo: repoSlug(info.remote) })}
                  onClick={() => window.avb.openExternal(webUrl(info.remote))}
                >
                  <span className="repo-slug">{repoSlug(info.remote)}</span>
                  <ExternalIcon size={11} />
                </button>
                <button
                  className="primary"
                  disabled={working || !canPush}
                  onClick={() =>
                    act(
                      () =>
                        window.avb.gitPush({ projectPath: project.path, branch: info.branch }),
                      t('gitChip.pushedBranch', { branch: info.branch }),
                      t('gitChip.pushing')
                    )
                  }
                >
                  {pushLabel}
                </button>
                {info.dirty && (
                  <div className="hint-text">
                    {t('gitChip.uncommittedHint')}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="hint-text">
                  {t('gitChip.notOnGitHub')}
                </div>
                <button
                  className="primary"
                  disabled={working}
                  onClick={() => {
                    setOpen(false);
                    setShowPublish(true);
                  }}
                >
                  {t('gitChip.publishToGithubButton')}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {switchTo && (
        <SwitchBranchModal
          from={info.branch}
          to={switchTo}
          files={info.dirtyFiles || []}
          busy={busy}
          onCancel={() => setSwitchTo(null)}
          onTakeAlong={async () => {
            if (await switchNow(switchTo)) setSwitchTo(null);
          }}
          onCommitFirst={async (message) => {
            if (await commitThenSwitch(switchTo, message)) setSwitchTo(null);
          }}
        />
      )}

      {showPublish && (
        <PublishModal
          defaultName={project.name}
          branch={info.branch}
          onClose={() => setShowPublish(false)}
          onPublish={publish}
          openExternal={(u) => window.avb.openExternal(u)}
        />
      )}
    </div>
  );
}

// Shown when a branch switch would drag uncommitted work along. Deliberately
// has no default action: taking changes with you and leaving them behind are
// both reasonable, and picking one silently is how the edits ended up on the
// wrong branch in the first place.
function SwitchBranchModal({ from, to, files, busy, onCancel, onTakeAlong, onCommitFirst }) {
  const t = useT();
  const [message, setMessage] = useState('');
  const working = !!busy;
  const shown = files.slice(0, 5);
  const rest = files.length - shown.length;

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && !working && onCancel()}
    >
      <div className="modal">
        <div className="modal-header">{t('gitChip.switchModal.header')}</div>
        <div className="modal-body">
          <div className="hint-text">
            {t('gitChip.switchModal.description', { from, to })}
          </div>

          {shown.length > 0 && (
            <ul className="dirty-files">
              {shown.map((f) => (
                <li key={f}>{f}</li>
              ))}
              {rest > 0 && <li className="more">{t('gitChip.switchModal.moreFiles', { count: rest })}</li>}
            </ul>
          )}

          <div>
            <label>{t('gitChip.commitMessage')}</label>
            <input
              autoFocus
              placeholder={t('gitChip.switchModal.updatePlaceholder', { branch: from })}
              value={message}
              disabled={working}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !working) onCommitFirst(message.trim() || t('gitChip.switchModal.updatePlaceholder', { branch: from }));
              }}
            />
          </div>

          {working && (
            <div className="publish-progress">
              <span className="mini-spinner" />
              <span>{busy}</span>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onCancel} disabled={working}>
            {t('common.cancel')}
          </button>
          <button onClick={onTakeAlong} disabled={working} title={t('gitChip.switchModal.leaveUncommitted', { branch: to })}>
            {t('gitChip.switchModal.takeChanges', { branch: to })}
          </button>
          <button
            className="primary"
            disabled={working}
            onClick={() => onCommitFirst(message.trim() || t('gitChip.switchModal.updatePlaceholder', { branch: from }))}
          >
            {t('gitChip.switchModal.commitThenSwitch', { from })}
          </button>
        </div>
      </div>
    </div>
  );
}

function PublishModal({ defaultName, branch, onClose, onPublish, openExternal }) {
  const t = useT();
  const [name, setName] = useState(
    defaultName.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '')
  );
  const [isPrivate, setIsPrivate] = useState(true);
  const [gh, setGh] = useState(null); // null = still checking
  const [phase, setPhase] = useState('form'); // form | publishing | done
  const [step, setStep] = useState('');
  const [error, setError] = useState(null);
  const [url, setUrl] = useState(null);

  // Preflight, so a missing or logged-out gh is visible before the user
  // bothers filling anything in.
  useEffect(() => {
    let alive = true;
    window.avb
      .ghStatus()
      .then((s) => alive && setGh(s))
      .catch(() => alive && setGh({ installed: false, authed: false }));
    return () => {
      alive = false;
    };
  }, []);

  const publishing = phase === 'publishing';
  const ready = gh?.installed && gh?.authed;

  const go = async () => {
    setError(null);
    setPhase('publishing');
    setStep(t('gitChip.publishModal.preparing'));
    try {
      const result = await onPublish({
        repoName: name.trim(),
        isPrivate,
        onStep: setStep,
      });
      setUrl(result);
      setPhase('done');
    } catch (err) {
      setError(cleanError(err));
      setPhase('form'); // keep the form filled in so it can be retried
    }
  };

  return (
    <div
      className="modal-overlay"
      onMouseDown={(e) => e.target === e.currentTarget && !publishing && onClose()}
    >
      <div className="modal">
        <div className="modal-header">
          {phase === 'done' ? t('gitChip.publishModal.published') : t('gitChip.publish')}
        </div>

        {phase === 'done' ? (
          <>
            <div className="modal-body">
              <div className="publish-done">
                <CheckIcon size={14} />
                <span>
                  {t('gitChip.publishModal.publishedDesc', { name, branch })}
                </span>
              </div>
              {url && (
                <button className="repo-link" onClick={() => openExternal(url)}>
                  <span className="repo-slug">{repoSlug(url)}</span>
                  <ExternalIcon size={11} />
                </button>
              )}
            </div>
            <div className="modal-footer">
              <button className="primary" onClick={onClose}>
                {t('common.done')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="modal-body">
              <div>
                <label>{t('gitChip.publishModal.repoName')}</label>
                <input
                  autoFocus
                  value={name}
                  disabled={publishing}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && name.trim() && ready && !publishing) go();
                  }}
                />
              </div>

              <label className="check-row">
                <input
                  type="checkbox"
                  checked={isPrivate}
                  disabled={publishing}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                />
                {t('gitChip.publishModal.privateRepo')}
              </label>

              {gh === null && <div className="hint-text">{t('gitChip.publishModal.checkingGh')}</div>}

              {gh && !gh.installed && (
                <div className="error-text">{t('gitChip.publishModal.ghNotInstalled')}</div>
              )}
              {gh?.installed && !gh.authed && (
                <div className="error-text">{t('gitChip.publishModal.ghNotAuthed')}</div>
              )}
              {ready && !publishing && !error && (
                <div className="hint-text">
                  {t('gitChip.publishModal.publishHint', {
                    visibility: isPrivate ? 'private' : 'public',
                    branch,
                    user: gh.user ? ` to ${gh.user}` : '',
                  })}
                </div>
              )}

              {publishing && (
                <div className="publish-progress">
                  <span className="mini-spinner" />
                  <span>{step}</span>
                </div>
              )}

              {error && <div className="error-text">{error}</div>}
            </div>

            <div className="modal-footer">
              <button onClick={onClose} disabled={publishing}>
                {t('common.cancel')}
              </button>
              <button
                className="primary"
                disabled={!name.trim() || !ready || publishing}
                onClick={go}
              >
                {publishing ? t('gitChip.publishModal.publishing') : error ? t('gitChip.publishModal.tryAgain') : t('gitChip.publishModal.publish')}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
