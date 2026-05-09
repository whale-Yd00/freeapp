# 构建和打包APK指南

本指南将引导您完成使用Capacitor将Web应用打包为Android APK的步骤。

## 准备工作

确保您已经完成以下准备工作：

1. 已经安装了最新的Node.js和npm
2. 已经安装了Android Studio和Android SDK
3. 已经设置了JAVA_HOME和ANDROID_HOME环境变量
4. 已经完成了所有代码修改

## 同步最新代码

在构建APK之前，确保所有的Web代码变更都已同步到Android项目中：

```bash
npx cap sync android
```

## 构建方法一：使用Android Studio

这是推荐的方法，因为它提供了完整的IDE支持和调试功能：

1. 打开Android Studio中的项目：
   ```bash
   npx cap open android
   ```

2. 在Android Studio中，选择顶部菜单栏的 **Build > Build Bundle(s) / APK(s) > Build APK(s)**

3. 等待构建过程完成，右下角会弹出通知

4. 点击通知中的 **locate** 链接，找到生成的APK文件

5. 生成的APK文件路径通常为：`android/app/build/outputs/apk/debug/app-debug.apk`

## 构建方法二：使用命令行（可选）

如果您已经配置好了环境，也可以使用Gradle命令行工具构建：

1. 进入Android项目目录：
   ```bash
   cd android
   ```

2. 在Windows上使用以下命令：
   ```bash
   .\gradlew assembleDebug
   ```
   
   在Linux/Mac上使用以下命令：
   ```bash
   ./gradlew assembleDebug
   ```

3. 生成的APK文件路径为：`android/app/build/outputs/apk/debug/app-debug.apk`

## 签名APK（用于生产发布）

上述方法生成的是开发版APK。如果您想要发布到应用商店，需要创建签名版本：

1. 在Android Studio中，选择 **Build > Generate Signed Bundle / APK**

2. 选择 **APK** 并点击 **Next**

3. 如果您已经有密钥库文件(keystore)，选择它并填写信息；如果没有，选择 **Create New** 创建一个新的密钥库

4. 填写表单内容（请记住密码和别名，将来更新应用时需要）

5. 点击 **Next**，选择 **release** 构建变体

6. 点击 **Finish** 开始构建签名APK

7. 签名APK将保存在 `android/app/release/` 目录下

## 安装APK到设备

1. 将APK文件传输到Android设备中（通过USB传输、邮件、云存储等）

2. 在设备上找到并点击APK文件

3. 如果首次安装来自未知来源的应用，需要在设置中允许"安装未知来源应用"的权限

4. 按照屏幕上的提示完成安装

## 故障排除

如果构建过程中遇到问题：

1. 确保Java和Android SDK路径正确配置
2. 确保所有依赖项都已正确安装
3. 检查Android Studio中的错误日志
4. 尝试清理项目：在Android Studio中选择 **Build > Clean Project**
