/**
 * Page context entry point - bundles all VSC modules for injection
 * This runs in the page context with access to page APIs but not extension APIs.
 * All modules are loaded in dependency order to ensure proper initialization
 */

// Core utilities and constants - must load first
import '../utils/constants.ts';
import '../utils/logger.ts';
import '../utils/debug-helper.ts';
import '../utils/dom-utils.ts';
import '../utils/event-manager.ts';

// Site pattern matching — side-effect import registers window.VSC.matchSiteRule.
// Must come before settings.ts so load() can call it.
import '../utils/site-pattern.ts';

// Storage and settings - depends on utils
import '../core/storage-manager.ts';
import '../core/settings.ts';

// State management - depends on utils and logger
import '../core/state-manager.ts';

// Observers - depends on utils and settings
import '../observers/media-observer.ts';
import '../observers/mutation-observer.ts';

// Core functionality - depends on settings and observers
import '../core/action-handler.ts';
import '../core/video-controller.ts';

// UI components - depends on core functionality
import '../ui/controls.ts';
import '../ui/drag-handler.ts';
import '../ui/shadow-dom.ts';
import '../ui/vsc-controller-element.ts';

// Site-specific handlers - depends on core
import '../site-handlers/base-handler.ts';
import '../site-handlers/netflix-handler.ts';
import '../site-handlers/youtube-handler.ts';
import '../site-handlers/facebook-handler.ts';
import '../site-handlers/amazon-handler.ts';
import '../site-handlers/apple-handler.ts';
import '../site-handlers/dailymotion-handler.ts';
import '../site-handlers/index.ts';

// Netflix-specific script
import '../site-handlers/scripts/netflix.ts';

// Main initialization - must be last
import '../content/inject.ts';

// The modules above populate window.VSC namespace and window.VSC_controller
// No additional exports needed here - side effects handle initialization
