//! Brings the window of this process to the front when another call hands it a file (`--reuse`).
//!
//! `set_focus` alone is not enough: asked by the window itself, Cinnamon (and other X11 window
//! managers with focus stealing prevention) refuses the focus and only marks the window in the
//! taskbar. Asked as a pager (what a taskbar does on a click), it grants it. As CodeDeck's
//! `window::activate_as_pager`.

/// Asks the window manager to activate this process's window the way a pager does
/// (`_NET_ACTIVE_WINDOW` with source 2). X11 only; elsewhere nothing happens.
#[cfg(target_os = "linux")]
pub(crate) fn as_pager(title: &str) -> Option<()> {
    use x11rb::connection::Connection;
    use x11rb::protocol::xproto::{AtomEnum, ClientMessageEvent, ConnectionExt, EventMask};
    // Under Wayland only XWayland would answer, and it cannot raise native windows
    if std::env::var("XDG_SESSION_TYPE").is_ok_and(|t| t == "wayland") || std::env::var_os("DISPLAY").is_none() {
        return None;
    }
    let (conn, screen) = x11rb::connect(None).ok()?;
    let root = conn.setup().roots.get(screen)?.root;
    let atom = |name: &str| conn.intern_atom(false, name.as_bytes()).ok()?.reply().ok().map(|r| r.atom);
    let (clients, pid_atom, active) = (atom("_NET_CLIENT_LIST")?, atom("_NET_WM_PID")?, atom("_NET_ACTIVE_WINDOW")?);
    let (name_atom, utf8) = (atom("_NET_WM_NAME")?, atom("UTF8_STRING")?);
    let list = conn.get_property(false, root, clients, AtomEnum::WINDOW, 0, 4096).ok()?.reply().ok()?;
    let me = std::process::id();
    let mine: Vec<u32> = list
        .value32()?
        .filter(|&w| {
            conn.get_property(false, w, pid_atom, AtomEnum::CARDINAL, 0, 1)
                .ok()
                .and_then(|c| c.reply().ok())
                .and_then(|r| r.value32().and_then(|mut v| v.next()))
                == Some(me)
        })
        .collect();
    // Several windows of this process (a dialog beside): the one with the title; one alone needs none
    let ours = mine.iter().copied().find(|&w| {
        conn.get_property(false, w, name_atom, utf8, 0, 1024)
            .ok()
            .and_then(|c| c.reply().ok())
            .is_some_and(|r| r.value == title.as_bytes())
    });
    let ours = ours.or_else(|| (mine.len() == 1).then(|| mine[0]))?;
    let event = ClientMessageEvent::new(32, ours, active, [2, x11rb::CURRENT_TIME, 0, 0, 0]);
    conn.send_event(false, root, EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY, event).ok()?;
    conn.flush().ok()
}

#[cfg(not(target_os = "linux"))]
pub(crate) fn as_pager(_title: &str) -> Option<()> {
    None
}
