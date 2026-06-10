import pandas as pd
import os

from backend.excel.reader import excel_file_compat, read_excel_compat


def extract_pricing_data(input_path, output_path=None):
    """
    从AA铝架台价格查询表中提取标准定价数据

    参数:
        input_path: 输入文件路径
        output_path: 输出文件路径（可选，默认在输入文件同目录生成）
    """
    # 如果没有指定输出路径，则在输入文件同目录生成
    if output_path is None:
        dir_name = os.path.dirname(input_path)
        file_name = os.path.splitext(os.path.basename(input_path))[0]
        output_path = os.path.join(dir_name, f"{file_name}_标准定价提取结果.xlsx")

    # 读取Excel文件
    print(f"正在读取文件: {input_path}")
    excel_file = excel_file_compat(input_path)

    # 查找"标准定价"页
    target_sheet = None
    for sheet_name in excel_file.sheet_names:
        if '标准定价' in sheet_name:
            target_sheet = sheet_name
            break

    if target_sheet is None:
        raise ValueError("未找到包含'标准定价'的Sheet页")

    print(f"找到目标Sheet: {target_sheet}")

    # 读取原始数据（不设置表头）
    df_raw = read_excel_compat(input_path, sheet_name=target_sheet, header=None)

    # 提取需要的五列数据
    # 列1: 工程编码 (B列)
    # 列3: 规格说明 (D列)
    # 列4: 工程品名 (E列)
    # 列6: 单位 (G列)
    # 列9: 10u小氧化(美元) (J列)
    result_df = df_raw.iloc[3:, [1, 3, 4, 6, 9]].copy()
    result_df.columns = ['工程编码', '规格说明', '工程品名', '单位', '10u小氧化(美元)']

    # 重置索引
    result_df = result_df.reset_index(drop=True)

    # 删除工程编码为空的行
    result_df = result_df[result_df['工程编码'].notna()]

    # 处理单位转换逻辑：当规格说明为"补充长度(mm)"时，单位改为"米"
    mask = result_df['规格说明'] == '补充长度(mm)'
    result_df.loc[mask, '单位'] = '米'

    # 统计转换数量
    convert_count = mask.sum()
    print(f"\n已将 {convert_count} 条记录的单位从'支'改为'米'")

    # 转换10u小氧化(美元)为数值类型
    result_df['10u小氧化(美元)'] = pd.to_numeric(result_df['10u小氧化(美元)'], errors='coerce')

    # 保存结果
    result_df.to_excel(output_path, index=False, engine='openpyxl')

    print(f"\n提取完成！")
    print(f"输出文件: {output_path}")
    print(f"共提取 {len(result_df)} 条记录")
    print(f"工程编码数量: {result_df['工程编码'].nunique()}")

    # 显示列信息
    print("\n提取的列：")
    print(result_df.columns.tolist())

    return result_df
