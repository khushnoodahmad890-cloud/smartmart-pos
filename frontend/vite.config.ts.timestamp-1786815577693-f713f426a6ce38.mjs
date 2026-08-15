// vite.config.ts
import { defineConfig } from "file:///D:/Full%20Stack/pos-system/frontend/node_modules/vite/dist/node/index.js";
import react from "file:///D:/Full%20Stack/pos-system/frontend/node_modules/@vitejs/plugin-react/dist/index.js";
import tailwindcss from "file:///D:/Full%20Stack/pos-system/frontend/node_modules/@tailwindcss/vite/dist/index.mjs";
var vite_config_default = defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3e3,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:4000",
        changeOrigin: true
      }
    }
  },
  preview: { host: "0.0.0.0", port: 3e3 }
});
export {
  vite_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCJEOlxcXFxGdWxsIFN0YWNrXFxcXHBvcy1zeXN0ZW1cXFxcZnJvbnRlbmRcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIkQ6XFxcXEZ1bGwgU3RhY2tcXFxccG9zLXN5c3RlbVxcXFxmcm9udGVuZFxcXFx2aXRlLmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vRDovRnVsbCUyMFN0YWNrL3Bvcy1zeXN0ZW0vZnJvbnRlbmQvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlJztcbmltcG9ydCByZWFjdCBmcm9tICdAdml0ZWpzL3BsdWdpbi1yZWFjdCc7XG5pbXBvcnQgdGFpbHdpbmRjc3MgZnJvbSAnQHRhaWx3aW5kY3NzL3ZpdGUnO1xuXG4vLyBBUEkgVVJMIGlzIGNvbmZpZ3VyYWJsZTogaW4gZGV2IHdlIHByb3h5IC9hcGkgdG8gdGhlIGxvY2FsIGJhY2tlbmQ7XG4vLyBpbiBwcm9kdWN0aW9uIHNldCBWSVRFX0FQSV9VUkwgdG8gdGhlIGRlcGxveWVkIGJhY2tlbmQgb3JpZ2luLlxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3JlYWN0KCksIHRhaWx3aW5kY3NzKCldLFxuICBzZXJ2ZXI6IHtcbiAgICBob3N0OiAnMC4wLjAuMCcsXG4gICAgcG9ydDogMzAwMCxcbiAgICBhbGxvd2VkSG9zdHM6IHRydWUsXG4gICAgcHJveHk6IHtcbiAgICAgICcvYXBpJzoge1xuICAgICAgICB0YXJnZXQ6ICdodHRwOi8vMTI3LjAuMC4xOjQwMDAnLFxuICAgICAgICBjaGFuZ2VPcmlnaW46IHRydWUsXG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG4gIHByZXZpZXc6IHsgaG9zdDogJzAuMC4wLjAnLCBwb3J0OiAzMDAwIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBK1IsU0FBUyxvQkFBb0I7QUFDNVQsT0FBTyxXQUFXO0FBQ2xCLE9BQU8saUJBQWlCO0FBSXhCLElBQU8sc0JBQVEsYUFBYTtBQUFBLEVBQzFCLFNBQVMsQ0FBQyxNQUFNLEdBQUcsWUFBWSxDQUFDO0FBQUEsRUFDaEMsUUFBUTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sTUFBTTtBQUFBLElBQ04sY0FBYztBQUFBLElBQ2QsT0FBTztBQUFBLE1BQ0wsUUFBUTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsY0FBYztBQUFBLE1BQ2hCO0FBQUEsSUFDRjtBQUFBLEVBQ0Y7QUFBQSxFQUNBLFNBQVMsRUFBRSxNQUFNLFdBQVcsTUFBTSxJQUFLO0FBQ3pDLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
