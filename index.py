import os
import tempfile
import zipfile

import streamlit as st
import subprocess


AO_EMAIL = os.getenv("AO_EMAIL", "")
AO_PASSWORD = os.getenv("AO_PASSWORD", "")


def invoke_dowloader(email: str, password: str, urls: list[str]) -> str | None:
    tmpdir = tempfile.mkdtemp(prefix="archive-org-books-", dir="downloads")
    run_args = ["python", "main.py"]
    run_args.extend([f"--email={email}", f"--password={password}", f"--dir={tmpdir}"])
    run_args.extend(f"--url={url}" for url in urls)
    _ = subprocess.run(run_args)
    dirname, _, filenames = next(os.walk(tmpdir))

    if len(filenames) == 0:
        return None

    tmpfile = tempfile.mktemp(prefix="archive-org-books-", suffix=".zip")

    with zipfile.ZipFile(tmpfile, "w") as zipped:
        for filename in filenames:
            zipped.write(os.path.join(dirname, filename), arcname=filename)

    return tmpfile


st.session_state.running = st.session_state.get("_running", False)
st.session_state.zipped_file = st.session_state.get("zipped_file", None)
st.session_state.feedback = st.session_state.get("feedback", None)
st.set_page_config(page_title="Baixador de Livros do Archive.org")


@st.dialog("Mensagem")
def show_message(message: str):
    st.write(message)


def main():
    st.title("Baixador de Livros do Archive.org")
    books_urls = st.text_area(
        "URL dos Livros", height=200, disabled=st.session_state.running
    ).splitlines()

    if st.session_state.feedback:
        show_message(st.session_state.feedback)
        st.session_state.feedback = None

    if st.button(
        "Requisitar Livros", disabled=st.session_state.running, key="_running"
    ):
        try:
            if not books_urls:
                st.session_state.feedback = "A listagem de livros esta vazia"
                st.session_state.zipped_file = None
            else:
                with st.spinner("Requisitando Livros ..."):
                    st.session_state.zipped_file = invoke_dowloader(AO_EMAIL, AO_PASSWORD, books_urls)
        except Exception as error:
            show_message(str(error))
            st.session_state.zipped_file = None
        finally:
            st.rerun()

    if st.session_state.zipped_file:
        with open(st.session_state.zipped_file, "rb") as file:
            if st.download_button(
                "Baixar",
                data=file,
                file_name=os.path.basename(st.session_state.zipped_file),
                type="secondary",
            ):
                # st.session_state.zipped_file = None
                st.rerun()


main()
