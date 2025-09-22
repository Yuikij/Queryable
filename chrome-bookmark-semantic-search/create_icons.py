#!/usr/bin/env python3
"""
创建Chrome扩展图标的脚本
"""

try:
    from PIL import Image, ImageDraw
    import os
    
    def create_icon(size, filename):
        """创建指定尺寸的图标"""
        # 创建一个新的图像，背景透明
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(img)
        
        # 绘制圆形背景
        margin = size // 8
        draw.ellipse([margin, margin, size-margin, size-margin], 
                    fill=(102, 126, 234, 255))  # 蓝紫色
        
        # 绘制搜索图标（简化版）
        center = size // 2
        radius = size // 4
        line_width = max(1, size // 16)
        
        # 搜索圆圈
        draw.ellipse([center-radius, center-radius, center+radius, center+radius], 
                    outline=(255, 255, 255, 255), width=line_width)
        
        # 搜索手柄
        handle_start_x = center + radius // 1.4
        handle_start_y = center + radius // 1.4
        handle_end_x = center + radius * 1.5
        handle_end_y = center + radius * 1.5
        draw.line([handle_start_x, handle_start_y, handle_end_x, handle_end_y], 
                  fill=(255, 255, 255, 255), width=line_width)
        
        # 确保目录存在
        os.makedirs(os.path.dirname(filename), exist_ok=True)
        
        # 保存图标
        img.save(filename, 'PNG')
        print(f'✅ 创建图标: {filename}')
        return True

    def main():
        """主函数"""
        print("🎨 开始创建Chrome扩展图标...")
        
        icons = [
            (16, 'icons/icon16.png'),
            (48, 'icons/icon48.png'), 
            (128, 'icons/icon128.png')
        ]
        
        success_count = 0
        for size, filename in icons:
            try:
                if create_icon(size, filename):
                    success_count += 1
            except Exception as e:
                print(f'❌ 创建 {filename} 失败: {e}')
        
        print(f"\n🎉 完成! 成功创建 {success_count}/{len(icons)} 个图标")
        return success_count == len(icons)

    if __name__ == "__main__":
        main()

except ImportError:
    print("❌ 错误: 需要安装 Pillow 库")
    print("📦 请运行: pip install Pillow")
    print("\n🔄 或者使用更简单的解决方案:")
    print("1. 修改 manifest.json 移除图标配置")
    print("2. 从网上下载现成的图标文件")
except Exception as e:
    print(f"❌ 创建图标时出错: {e}")
