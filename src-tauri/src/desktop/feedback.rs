//! 托盘反馈的可测试状态：旧延时不得覆盖新的上传，并发批次结束前保持上传状态。
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Status {
    Idle,
    Uploading,
    Success,
    Error,
}
impl Status {
    pub fn name(self) -> &'static str {
        match self {
            Self::Idle => "idle",
            Self::Uploading => "uploading",
            Self::Success => "success",
            Self::Error => "error",
        }
    }
}
#[derive(Clone, Copy, Debug)]
pub struct Visual {
    pub status: Status,
    pub revision: u64,
    pub transient: bool,
}
#[derive(Default)]
pub struct Feedback {
    active: usize,
    revision: u64,
    succeeded: usize,
    failed: usize,
    clipboard_failed: bool,
}
impl Feedback {
    fn visual(&mut self, status: Status) -> Visual {
        self.revision += 1;
        Visual {
            status,
            revision: self.revision,
            transient: self.active == 0 && status != Status::Idle,
        }
    }
    pub fn start(&mut self) -> Visual {
        if self.active == 0 {
            self.succeeded = 0;
            self.failed = 0;
            self.clipboard_failed = false;
        }
        self.active += 1;
        self.visual(Status::Uploading)
    }
    pub fn finish(&mut self, succeeded: usize, failed: usize, clipboard_failed: bool) -> Visual {
        self.active = self.active.saturating_sub(1);
        self.succeeded += succeeded;
        self.failed += failed;
        self.clipboard_failed |= clipboard_failed;
        let status = if self.active > 0 {
            Status::Uploading
        } else if self.succeeded > 0 && !self.clipboard_failed {
            Status::Success
        } else {
            Status::Error
        };
        self.visual(status)
    }
    pub fn flash(&mut self, failed: bool) -> Visual {
        self.visual(if self.active > 0 {
            Status::Uploading
        } else if failed {
            Status::Error
        } else {
            Status::Success
        })
    }
    pub fn counts(&self) -> (usize, usize, bool) {
        (self.succeeded, self.failed, self.clipboard_failed)
    }
    /// 在主线程提交图标前再次校验，覆盖计时回调与新批次之间的竞态。
    pub fn is_current(&self, revision: u64) -> bool {
        self.revision == revision
    }
    pub fn reset(&mut self, revision: u64) -> Option<Visual> {
        if self.active == 0 && self.revision == revision {
            Some(self.visual(Status::Idle))
        } else {
            None
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn stale_success_timer_cannot_override_new_upload() {
        let mut f = Feedback::default();
        f.start();
        let done = f.finish(1, 0, false);
        assert!(done.transient);
        f.start();
        assert!(f.reset(done.revision).is_none());
    }
    #[test]
    fn concurrent_uploads_remain_busy_until_every_batch_finishes() {
        let mut f = Feedback::default();
        f.start();
        f.start();
        let first = f.finish(1, 0, false);
        assert_eq!(first.status, Status::Uploading);
        assert!(!first.transient);
        assert_eq!(f.finish(0, 1, false).status, Status::Success);
    }
    #[test]
    fn copying_during_upload_does_not_replace_busy_icon() {
        let mut f = Feedback::default();
        f.start();
        let flash = f.flash(false);
        assert_eq!(flash.status, Status::Uploading);
        assert!(f.reset(flash.revision).is_none());
    }
    #[test]
    fn reset_already_queued_cannot_render_over_new_upload() {
        let mut f = Feedback::default();
        f.start();
        let done = f.finish(1, 0, false);
        let reset = f.reset(done.revision).unwrap();
        f.start();
        assert!(!f.is_current(reset.revision));
    }
    #[test]
    fn concurrent_clipboard_failure_remains_in_final_summary() {
        let mut f = Feedback::default();
        f.start();
        f.start();
        f.finish(1, 0, true);
        assert_eq!(f.finish(1, 0, false).status, Status::Error);
        assert_eq!(f.counts(), (2, 0, true));
    }
    #[test]
    fn clipboard_failure_is_not_reported_as_copied() {
        let mut f = Feedback::default();
        f.start();
        let done = f.finish(1, 0, true);
        assert_eq!(done.status, Status::Error);
        assert_eq!(f.reset(done.revision).unwrap().status, Status::Idle);
    }
}
