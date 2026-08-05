import re
import json
import pyperclip

def extract_languages_from_clipboard():
    try:
        # 1. 从剪贴板获取内容
        clipboard_content = pyperclip.paste()
        print("✅ 已成功读取剪贴板内容")
        
        # 2. 使用正则表达式提取 href 中的语言类型
        # 匹配模式：/trending/ 后面跟着非 '?' 的字符，直到遇到 ?
        # data-action="/directory/windows/"
        pattern = r'data-action="/directory/([^/]+)/"'
        matches = re.findall(pattern, clipboard_content)
        
        if not matches:
            print("⚠️ 未在剪贴板内容中找到匹配的语言类型。")
            return

        # 3. 对结果进行去重（防止重复项）并排序
        # 使用 dict.fromkeys 保持原始顺序的同时去重
        unique_languages = list(dict.fromkeys(matches))
        
        # 4. 转换为 JSON 格式
        json_output = json.dumps(unique_languages, indent=2, ensure_ascii=False)
        
        # 5. 输出结果
        print(f"✅ 提取完成！共找到 {len(unique_languages)} 种语言类型：\n")
        print(json_output)
        
        # 可选：将结果也复制回剪贴板
        pyperclip.copy(json_output)
        print("\n\n💡 结果已自动复制到剪贴板。")

    except ImportError:
        print("❌ 缺少 pyperclip 库。请运行 'pip install pyperclip' 安装。")
    except Exception as e:
        print(f"❌ 发生错误: {e}")

if __name__ == "__main__":
    extract_languages_from_clipboard()