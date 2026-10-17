//! Stable Windows hub dragging. Tauri's start_dragging() is unreliable when
//! invoked after Chromium has already captured a pointer and can trigger a
//! spurious blur event in a frameless transparent window.
//!
//! Instead, Windows cursor and window positions are sampled in the same physical
//! pixel coordinate system. A worker follows the cursor while the left button is
//! down. This avoids mixing Chromium CSS pixels with Windows display scaling.

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};
use tauri::{Manager, PhysicalPosition};

use crate::native_windows;

#[derive(Default)]
pub struct HubDragState {
    active: AtomicBool,
    last_finished: Mutex<Option<Instant>>,
}

impl HubDragState {
    pub fn should_ignore_blur(&self) -> bool {
        if self.active.load(Ordering::Acquire) { return true; }
        self.last_finished
            .lock()
            .ok()
            .and_then(|guard| *guard)
            .is_some_and(|finish| finish.elapsed() < Duration::from_millis(350))
    }
}

#[derive(Clone, Copy)]
struct Display {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}

fn clamp_to_display(position: (i32, i32), size: (i32, i32),
    cursor: (i32, i32), displays: &[Display]) -> (i32, i32)
{
    let nearest = displays.iter().min_by_key(|display| {
        let dx = if cursor.0 < display.x {
            (display.x as i64) - cursor.0 as i64
        } else {
            (cursor.0 as i64 - (display.x as i64 + display.width as i64)).max(0)
        };
        let dy = if cursor.1 < display.y {
            (display.y as i64) - cursor.1 as i64
        } else {
            (cursor.1 as i64 - (display.y as i64 + display.height as i64)).max(0)
        };
        dx * dx + dy * dy
    });
    let Some(display) = nearest else { return position; };

    // When the monitor is smaller than the wheel, anchor to its top-left.
    let max_x = display.x.saturating_add(display.width.saturating_sub(size.0).max(0));
    let max_y = display.y.saturating_add(display.height.saturating_sub(size.1).max(0));
    (position.0.clamp(display.x, max_x), position.1.clamp(display.y, max_y))
}

fn translated_position(start: (i32, i32), initial_cursor: (i32, i32),
    current_cursor: (i32, i32)) -> (i32, i32)
{
    (
        start.0.saturating_add(current_cursor.0.saturating_sub(initial_cursor.0)),
        start.1.saturating_add(current_cursor.1.saturating_sub(initial_cursor.1))
    )
}

#[tauri::command]
pub fn start_hub_drag(
    window: tauri::WebviewWindow,
    state: tauri::State<'_, Arc<HubDragState>>,
) -> Result<(), String> {
    if state.active.load(Ordering::Acquire) { return Ok(()); }

    // Both coordinates are PHYSICAL Windows desktop pixels, not WebView CSS px.
    let cursor_at_start = native_windows::cursor_position()?;
    let initial_position = window.outer_position().map_err(|e| e.to_string())?;
    let size = window.outer_size().map_err(|e| e.to_string())?;
    if state.active.swap(true, Ordering::AcqRel) { return Ok(()); }

    let drag_state = Arc::clone(state.inner());
    tauri::async_runtime::spawn_blocking(move || {
        let origin = (initial_position.x, initial_position.y);
        let mut last = origin;

        while drag_state.active.load(Ordering::Acquire) && native_windows::left_button_down() {
            if let Ok(cursor) = native_windows::cursor_position() {
                let next = translated_position(origin, cursor_at_start, cursor);
                if next != last {
                    if window.set_position(PhysicalPosition::new(next.0, next.1)).is_err() { break; }
                    last = next;
                }
            }
            std::thread::sleep(Duration::from_millis(16));
        }

        // Wait until release to constrain the window. During the gesture the
        // window may span monitor borders without suddenly snapping/jumping.
        if let Ok(cursor) = native_windows::cursor_position() {
            let wanted = translated_position(origin, cursor_at_start, cursor);
            let displays: Vec<Display> = window.available_monitors()
                .unwrap_or_default().iter()
                .map(|m| {
                    let p = m.position();
                    let s = m.size();
                    Display {
                        x: p.x, y: p.y, width: s.width as i32, height: s.height as i32
                    }
                })
                .collect();
            let final_position = clamp_to_display(
                wanted, (size.width as i32, size.height as i32), cursor, &displays
            );
            if final_position != last {
                let _ = window.set_position(PhysicalPosition::new(final_position.0, final_position.1));
            }
        }
        // A delayed Focused(false) from this gesture must not auto-hide Kreis.
        if let Ok(mut finished) = drag_state.last_finished.lock() {
            *finished = Some(Instant::now());
        }
        drag_state.active.store(false, Ordering::Release);
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn absolute_desktop_pixels_preserve_origin_and_relative_movement() {
        assert_eq!(translated_position((100, 200), (250, 350), (250, 350)), (100, 200));
        assert_eq!(translated_position((100, 200), (250, 350), (300, 375)), (150, 225));
        assert_eq!(translated_position((-1000, 40), (-800, 100), (-900, 80)), (-1100, 20));
    }

    #[test]
    fn clamping_obeys_cursor_monitor_in_multi_display_and_negative_coordinates() {
        let monitors = [
            Display { x: -1600, y: 0, width: 1600, height: 900 },
            Display { x: 0, y: 0, width: 1920, height: 1080 }
        ];
        assert_eq!(
            clamp_to_display((-1500, 450), (600, 600), (-1100, 700), &monitors),
            (-1500, 300)
        );
        assert_eq!(
            clamp_to_display((1800, 950), (600, 600), (1850, 970), &monitors),
            (1320, 480)
        );
    }

    #[test]
    fn small_monitor_and_missing_monitors_do_not_panic() {
        let monitor = [Display { x: 100, y: 200, width: 350, height: 300 }];
        assert_eq!(clamp_to_display((-200, 500), (600, 600), (150, 250), &monitor), (100, 200));
        assert_eq!(clamp_to_display((1, 2), (600, 600), (0, 0), &[]), (1, 2));
    }
}
