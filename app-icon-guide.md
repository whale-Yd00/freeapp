# 设置App图标指南

按照以下步骤在Android Studio中设置您的App图标：

## 准备工作

1. 准备一张**正方形**的高分辨率图标（建议至少1024x1024像素）的PNG格式图片
2. 确保图片具有透明背景（如果需要）

## 在Android Studio中设置图标

1. 打开Android Studio，使用以下命令打开Android项目：
   ```
   npx cap open android
   ```

2. 在左侧项目视图中，右键点击 **app** 文件夹

3. 选择 **New > Image Asset**

4. 在弹出的窗口中：
   - **Icon Type**: 保持 **Launcher Icons (Adaptive & Legacy)**
   - **Asset Type**: 选择 **Image**
   - **Path**: 点击文件夹图标，选择您准备好的图标图片
   - **Resize**: 可以调整滑块来控制图标在背景中的大小

5. 切换到 **Background Layer** 标签页：
   - 设置背景颜色或背景图片

6. 点击 **Next**，然后点击 **Finish**

Android Studio会自动生成所有不同分辨率和形状的图标文件，并将它们放在正确的**mipmap**文件夹中。

## 图标生成完成后

图标设置完成后，需要重新构建应用：

1. 在Android Studio中同步项目（File > Sync Project with Gradle Files）

2. 或者在项目根目录中运行：
   ```
   npx cap sync android
   ```

## 构建APK

完成图标设置后，您可以按照以下步骤构建APK：

1. 在Android Studio顶部菜单栏，选择 **Build > Build Bundle(s) / APK(s) > Build APK(s)**

2. 构建完成后，点击右下角弹出的 **locate** 链接

3. 找到生成的APK文件（通常在 `android/app/build/outputs/apk/debug/app-debug.apk`）

4. 将APK文件传输到您的Android设备上安装使用

> 注意：确保您的Android设备已开启"允许安装未知来源的应用"权限
