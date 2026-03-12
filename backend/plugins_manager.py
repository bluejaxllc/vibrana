"""
Vibrana Plugin System — Phase 9
Extensibility framework for loading and managing plugins.
"""
import os
import json
import importlib.util
from datetime import datetime


class PluginManager:
    """Manages loading, registering, and executing plugins."""

    def __init__(self, plugin_dir='plugins'):
        self.plugin_dir = plugin_dir
        self.plugins = {}
        self.hooks = {}  # hook_name -> [callback_list]
        os.makedirs(plugin_dir, exist_ok=True)

    def discover(self):
        """Discover all plugins in the plugin directory."""
        discovered = []
        if not os.path.exists(self.plugin_dir):
            return discovered

        for item in os.listdir(self.plugin_dir):
            plugin_path = os.path.join(self.plugin_dir, item)
            manifest_path = os.path.join(plugin_path, 'manifest.json')

            if os.path.isdir(plugin_path) and os.path.exists(manifest_path):
                try:
                    with open(manifest_path, 'r') as f:
                        manifest = json.load(f)
                    manifest['path'] = plugin_path
                    manifest['status'] = 'discovered'
                    discovered.append(manifest)
                except (json.JSONDecodeError, IOError):
                    continue

        return discovered

    def load(self, plugin_name):
        """Load and activate a plugin by name."""
        plugin_path = os.path.join(self.plugin_dir, plugin_name)
        manifest_path = os.path.join(plugin_path, 'manifest.json')
        main_path = os.path.join(plugin_path, 'main.py')

        if not os.path.exists(manifest_path):
            return {"error": f"Plugin '{plugin_name}' not found"}

        with open(manifest_path, 'r') as f:
            manifest = json.load(f)

        if os.path.exists(main_path):
            try:
                spec = importlib.util.spec_from_file_location(plugin_name, main_path)
                module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(module)

                # Call plugin's register function if it exists
                if hasattr(module, 'register'):
                    hooks = module.register()
                    if hooks:
                        for hook_name, callback in hooks.items():
                            if hook_name not in self.hooks:
                                self.hooks[hook_name] = []
                            self.hooks[hook_name].append({
                                'plugin': plugin_name,
                                'callback': callback
                            })

                self.plugins[plugin_name] = {
                    'manifest': manifest,
                    'module': module,
                    'status': 'active',
                    'loaded_at': datetime.utcnow().isoformat()
                }

                return {"status": "loaded", "plugin": plugin_name}
            except Exception as e:
                return {"error": f"Failed to load plugin: {str(e)}"}
        else:
            # Manifest-only plugin (metadata only, no executable code)
            self.plugins[plugin_name] = {
                'manifest': manifest,
                'module': None,
                'status': 'metadata_only',
                'loaded_at': datetime.utcnow().isoformat()
            }
            return {"status": "metadata_only", "plugin": plugin_name}

    def unload(self, plugin_name):
        """Unload a plugin."""
        if plugin_name in self.plugins:
            # Remove hooks
            for hook_name in list(self.hooks.keys()):
                self.hooks[hook_name] = [
                    h for h in self.hooks[hook_name] if h['plugin'] != plugin_name
                ]
            del self.plugins[plugin_name]
            return {"status": "unloaded", "plugin": plugin_name}
        return {"error": "Plugin not loaded"}

    def execute_hook(self, hook_name, *args, **kwargs):
        """Execute all callbacks registered for a hook."""
        results = []
        for hook in self.hooks.get(hook_name, []):
            try:
                result = hook['callback'](*args, **kwargs)
                results.append({
                    'plugin': hook['plugin'],
                    'result': result
                })
            except Exception as e:
                results.append({
                    'plugin': hook['plugin'],
                    'error': str(e)
                })
        return results

    def list_plugins(self):
        """List all discovered and loaded plugins."""
        discovered = self.discover()
        plugin_list = []
        for d in discovered:
            name = d.get('name', 'unknown')
            is_loaded = name in self.plugins
            plugin_list.append({
                'name': name,
                'version': d.get('version', '0.0.0'),
                'description': d.get('description', ''),
                'author': d.get('author', ''),
                'status': self.plugins[name]['status'] if is_loaded else 'inactive',
                'hooks': d.get('hooks', [])
            })
        return plugin_list
