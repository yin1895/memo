use std::sync::atomic::{AtomicBool, Ordering};

/// 退出流程状态机：
/// - shutdown_started: 是否已进入退出流程（防重入）
/// - shutdown_acked: 前端是否已回传清理完成 ACK
#[derive(Default)]
pub struct ShutdownState {
    shutdown_started: AtomicBool,
    shutdown_acked: AtomicBool,
}

impl ShutdownState {
    /// 尝试进入退出流程。
    /// 首次调用返回 true，后续重复调用返回 false。
    pub fn try_begin_shutdown(&self) -> bool {
        if self.shutdown_started.swap(true, Ordering::SeqCst) {
            return false;
        }
        self.shutdown_acked.store(false, Ordering::SeqCst);
        true
    }

    /// 标记前端已完成清理并 ACK。
    pub fn mark_acked(&self) {
        self.shutdown_acked.store(true, Ordering::SeqCst);
    }

    /// 当前是否已收到 ACK。
    pub fn is_acked(&self) -> bool {
        self.shutdown_acked.load(Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::ShutdownState;

    #[test]
    fn try_begin_shutdown_should_be_idempotent() {
        let state = ShutdownState::default();
        assert!(state.try_begin_shutdown());
        assert!(!state.try_begin_shutdown());
    }

    #[test]
    fn mark_acked_should_set_ack_flag() {
        let state = ShutdownState::default();
        assert!(!state.is_acked());
        state.mark_acked();
        assert!(state.is_acked());
    }

    #[test]
    fn first_begin_should_reset_ack_to_false() {
        let state = ShutdownState::default();
        state.mark_acked();
        assert!(state.is_acked());
        assert!(state.try_begin_shutdown());
        assert!(!state.is_acked());
    }
}
