---
name: mobile-mcp
description: Automates iOS and Android simulators/emulators for mobile app development and testing. Use when the user needs to interact with a mobile simulator, test a mobile app, tap buttons, swipe, type text, take screenshots, or automate any mobile device interaction.
---

# Mobile Automation with mobile-mcp

Interact with iOS simulators, Android emulators, and real devices through structured accessibility data and coordinate-based taps. No computer vision model required — uses native accessibility trees when available, falls back to screenshot-based coordinates.

## Prerequisites

- **Node.js** v22+
- **iOS**: macOS with Xcode command line tools (`xcode-select --install`)
- **Android**: Android SDK Platform Tools (`adb` on PATH)

## Core Workflow

Every mobile automation follows this pattern:

1. **Discover devices**: `mobile_list_available_devices` to find available simulators/emulators
2. **Launch app**: `mobile_launch_app` with the bundle/package ID
3. **Inspect screen**: `mobile_list_elements_on_screen` to get UI elements with coordinates
4. **Interact**: Tap, swipe, type using coordinates from the element list
5. **Verify**: `mobile_take_screenshot` to confirm the result

## Starting a Simulator/Emulator

Before using mobile-mcp, ensure a simulator or emulator is running:

**iOS Simulator (macOS):**

```bash
xcrun simctl list devices available
xcrun simctl boot "iPhone 16"
open -a Simulator
```

**Android Emulator:**

```bash
emulator -list-avds
emulator -avd <avd_name> &
```

Then call `mobile_list_available_devices` to confirm the device is visible.

## Tool Reference

### Device Management

| Tool | Purpose |
|------|---------|
| `mobile_list_available_devices` | List all available devices (physical + simulators) |
| `mobile_get_screen_size` | Get screen dimensions in pixels |
| `mobile_set_orientation` | Set portrait or landscape |
| `mobile_get_orientation` | Get current orientation |

### App Management

| Tool | Purpose |
|------|---------|
| `mobile_launch_app` | Launch app by bundle/package ID |
| `mobile_terminate_app` | Stop a running app |

### Screen Inspection

| Tool | Purpose |
|------|---------|
| `mobile_list_elements_on_screen` | Get UI hierarchy with coordinates |
| `mobile_take_screenshot` | Take screenshot (returns image content) |

### Interaction

| Tool | Purpose |
|------|---------|
| `mobile_click_on_screen_at_coordinates` | Tap at x,y |
| `mobile_double_tap_on_screen` | Double-tap at x,y |
| `mobile_long_press_on_screen_at_coordinates` | Long press at x,y |
| `mobile_swipe_on_screen` | Swipe up/down/left/right |
| `mobile_type_keys` | Type text into focused element |
| `mobile_press_button` | Press hardware button (HOME, BACK, VOLUME_UP, etc.) |

## Common Patterns

### Discover and Launch

```
1. mobile_list_available_devices          → find your device
2. mobile_launch_app("com.example.app")   → start the app
3. mobile_list_elements_on_screen         → see what's on screen
4. mobile_take_screenshot                 → visual confirmation
```

### Tap a Button

```
1. mobile_list_elements_on_screen         → find the button and its coordinates
2. mobile_click_on_screen_at_coordinates  → tap at the button's x,y
3. mobile_list_elements_on_screen         → verify screen changed
```

### Fill a Form

```
1. mobile_list_elements_on_screen         → find input fields
2. mobile_click_on_screen_at_coordinates  → tap the input field to focus it
3. mobile_type_keys("user@example.com")   → type the value
4. mobile_click_on_screen_at_coordinates  → tap next field
5. mobile_type_keys("password123")        → type next value
6. mobile_click_on_screen_at_coordinates  → tap submit button
```

### Navigate Back

```
1. mobile_press_button("BACK")            → Android back button
2. mobile_press_button("HOME")            → Go to home screen
```

### Scroll Content

```
1. mobile_swipe_on_screen("up")           → scroll down (swipe up)
2. mobile_list_elements_on_screen         → check newly visible elements
```

### Multi-Step User Journey

```
1. mobile_launch_app("com.example.shop")
2. mobile_list_elements_on_screen         → find search bar
3. mobile_click_on_screen_at_coordinates  → tap search
4. mobile_type_keys("wireless headphones")
5. mobile_press_button("ENTER")
6. mobile_list_elements_on_screen         → find results
7. mobile_click_on_screen_at_coordinates  → tap first result
8. mobile_take_screenshot                 → verify product page
```

## Tips

- **Always inspect before interacting.** Call `mobile_list_elements_on_screen` to get accurate coordinates before tapping.
- **Re-inspect after navigation.** Screen coordinates change after taps, swipes, or page transitions.
- **Use screenshots for verification.** `mobile_take_screenshot` returns the image inline for visual confirmation.
- **Coordinate system is pixels.** Use `mobile_get_screen_size` if you need to calculate relative positions.
- **Hardware buttons vary by platform.** Android supports BACK, HOME, VOLUME_UP, VOLUME_DOWN, ENTER. iOS supports HOME.
