# 玄鲸虚拟聊天应用 - Capacitor 移动端打包指南

本项目使用Capacitor将Web应用转换为原生Android应用。以下是已经实现的功能和如何使用的指南。

## 已实现功能

1. **基础Capacitor项目设置**
   - 初始化npm项目
   - 安装并配置Capacitor
   - 添加Android平台

2. **刘海屏与底部导航栏适配**
   - 配置Android应用使用透明状态栏和导航栏
   - 通过CSS实现安全区域适配

3. **手机存储功能（数据导入/导出）**
   - 使用Capacitor Filesystem插件实现文件写入
   - 使用Capacitor FilePicker插件实现文件选择

4. **本地通知功能**
   - 使用Capacitor LocalNotifications插件实现本地通知
   - 添加通知权限处理

5. **App图标设置指南**
   - 提供在Android Studio中设置应用图标的详细指南

6. **APK构建打包指南**
   - 提供使用Android Studio构建APK的详细步骤

## 文件结构说明

- **`www/`** - Web应用源代码
  - **`capacitor.js`** - Capacitor插件初始化和导出
  - **`utils/notificationManager.js`** - 本地通知管理模块
  - **`utils/dataMigrator.js`** - 修改后支持移动端文件操作的数据导入导出模块

- **`android/`** - Android原生项目

- **`app-icon-guide.md`** - App图标设置指南
- **`build-apk-guide.md`** - APK构建打包指南

## 使用指南

### 1. 设置开发环境

确保安装了以下工具：
- Node.js和npm
- Android Studio
- JDK 17或更高版本
- Android SDK

### 2. 同步最新代码到Android项目

当您修改Web代码后，执行以下命令同步到Android项目：

```bash
npx cap sync
```

### 3. 打开Android项目

```bash
npx cap open android
```

### 4. 设置App图标

请参照 [app-icon-guide.md](./app-icon-guide.md) 文件中的说明设置应用图标。

### 5. 构建APK

请参照 [build-apk-guide.md](./build-apk-guide.md) 文件中的说明构建APK。

## 功能使用说明

### 数据导入/导出功能

- 在应用中，通过"我"页面 -> "数据管理"中的"导出数据"和"导入数据"按钮使用
- 导出数据将保存到设备的Documents目录
- 导入数据支持从文件选择器中选择备份JSON文件

### 本地通知功能

- 通知功能已封装在`window.notificationManager`对象中
- 可以使用`window.sendNotification(title, body, options)`函数发送通知
- 详细API请参考`utils/notificationManager.js`文件

## 注意事项

1. 在Android 13及以上系统中，首次使用文件和通知功能时需要请求相应权限
2. 应用使用了安全区域适配，请确保测试不同类型的设备（刘海屏、挖孔屏等）
3. 使用非Google Play渠道分发APK时，用户需要允许"安装未知来源的应用"权限

## 问题排查

如果遇到构建问题，请尝试：

1. 清理项目：在Android Studio中选择`Build > Clean Project`
2. 检查JAVA_HOME和ANDROID_HOME环境变量是否正确配置
3. 确保所有依赖项都已安装：`npm install`
4. 重新同步项目：`npx cap sync`

## 后续开发建议

- 考虑添加推送通知功能（Firebase Cloud Messaging）
- 优化设备深色模式适配
- 实现后台任务和服务
- 添加应用内更新功能
