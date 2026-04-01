import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp } from 'antd';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#0033A0',
          colorLink: '#3d8bfd',
          colorBgLayout: '#f4f7fc',
          colorBgContainer: '#ffffff',
          colorBgElevated: '#ffffff',
          colorBorder: '#e8e8ed',
          colorText: '#1a1a2e',
          colorTextSecondary: '#5a5a6e',
          borderRadius: 6,
          fontFamily: "'Segoe UI', system-ui, -apple-system, sans-serif",
        },
        components: {
          Table: {
            headerBg: '#f4f7fc',
            rowHoverBg: '#e8f0fe',
            borderColor: '#e8e8ed',
          },
          Modal: {
            contentBg: '#ffffff',
            headerBg: '#ffffff',
          },
          Select: {
            optionActiveBg: '#e8f0fe',
            optionSelectedBg: 'rgba(0,51,160,0.1)',
          },
          Input: {
            activeBorderColor: '#3d8bfd',
            hoverBorderColor: '#3d8bfd',
          },
          Button: {
            primaryColor: '#fff',
            colorPrimaryHover: '#3d8bfd',
          },
          Tag: {
            colorBgContainer: 'rgba(0,51,160,0.08)',
          },
        },
      }}
    >
      <AntApp>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>
);
